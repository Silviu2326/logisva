import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import cv from 'opencv.js';
import OpenAI from 'openai';
import { Mistral } from '@mistralai/mistralai'; // Nueva importación

// REMOVE cvReady related code
// // Promesa para asegurar que OpenCV.js está listo
// const cvReady = new Promise((resolve) => {
//   global.cv = cv; // Asegurarse de que cv esté en el ámbito global si es necesario
//   cv.onRuntimeInitialized = () => {
//     console.log('OpenCV.js is ready.');
//     resolve(true);
//   };
// });

// Configurar variables de entorno
dotenv.config();

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configurar multer para subida de archivos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Función para extraer número de checklist
// Función para extraer número de checklist
function extractChecklistNumber(raw) {
    const clean = raw
      .replace(/[\n\r\t]/g, ' ')
      .replace(/[^a-zA-Z0-9º°#:.\s-]/g, '')   // nada de rangos con '-' suelto
      .replace(/\s+/g, ' ')
      .toLowerCase();
  
    /* patrón directo  */
    const m = clean.match(/checklist\s*n[º°o0]?\s*[:\-.]?\s*(\d{5,7})/);
    if (m) return fix(m[1]);
  
    /* fallback de proximidad en la misma frase  */
    const i = clean.indexOf('checklist');
    if (i !== -1) {
      const win = clean.slice(i, i + 50);             // 50 → suficiente hasta el nº
      const m2 = win.match(/(\d{5,7})/);
      if (m2) return fix(m2[1]);
    }
    return null;      // esta vez sí devuelve algo en tus pruebas
  }
  
  function fix(n) {
    const map = { B:'8', S:'5', O:'0', G:'6', I:'1', l:'1' };
    return n.replace(/[BSOGIl]/g, ch => map[ch]).padStart(6,'0').slice(-6);
  }

// Función para procesar imagen con OpenAI cuando OCR tradicional falla
async function processImageWithOpenAI(imageBuffer, filename) {
  try {
    console.log(`Intentando extraer número de checklist con OpenAI para ${filename}`);
    
    // Convertir buffer a base64
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta imagen y extrae el número de checklist. Busca texto que diga 'Checklist N°', 'Checklist Nº', 'Checklist N', o similar, seguido de un número de 5-7 dígitos. Responde ÚNICAMENTE con el número encontrado, sin texto adicional. Si no encuentras un número de checklist, responde 'NO_ENCONTRADO'."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 50
    });

    const extractedText = response.choices[0]?.message?.content?.trim();
    console.log(`Respuesta de OpenAI para ${filename}: ${extractedText}`);
    
    if (extractedText && extractedText !== 'NO_ENCONTRADO') {
      // Limpiar y validar el número extraído
      const cleanNumber = extractedText.replace(/[^0-9]/g, '');
      if (cleanNumber.length >= 5 && cleanNumber.length <= 7) {
        const fixedNumber = fix(cleanNumber);
        console.log(`OpenAI extrajo número de checklist: ${fixedNumber} para ${filename}`);
        return {
          filename,
          checklistNumber: fixedNumber,
          extractedText: extractedText,
          confidence: 95, // Asumimos alta confianza para OpenAI
          processingMethod: 'openai_vision',
          wasCropped: false,
          cropRegion: null,
          success: true
        };
      }
    }
    
    console.log(`OpenAI no pudo extraer un número válido de checklist para ${filename}`);
    return null;
    
  } catch (error) {
    console.error(`Error procesando ${filename} con OpenAI:`, error.message);
    return null;
  }
}
  
async function deskew(buffer) {
  // Add a check to see if cv and its functions are available
  if (!cv || typeof cv.matFromImageData !== 'function' || typeof cv.cvtColor !== 'function') {
    console.error('OpenCV functions not available at the time of calling deskew.');
    console.log('Skipping deskew operation and returning original buffer.');
    return buffer; // Return original buffer if OpenCV is not ready
  }

  try {
    const { data: rawData, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const imageData = {
      data: new Uint8ClampedArray(rawData),
      width: info.width,
      height: info.height
    };
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    const thresh = new cv.Mat();
    cv.threshold(gray, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    // Alternative approach without cv.findNonZero
    let coords = [];
    if (typeof cv.findNonZero === 'function') {
      // Use cv.findNonZero if available
      coords = cv.findNonZero(thresh);
    } else {
      // Alternative: manually find non-zero points
      console.log('cv.findNonZero not available, using alternative method');
      const points = [];
      for (let y = 0; y < thresh.rows; y++) {
        for (let x = 0; x < thresh.cols; x++) {
          if (thresh.ucharPtr(y, x)[0] > 0) {
            points.push([x, y]);
          }
        }
      }
      
      if (points.length === 0) {
        // No non-zero points found, return original
        src.delete(); gray.delete(); thresh.delete();
        return buffer;
      }
      
      // Convert points to cv.Mat format
      coords = cv.matFromArray(points.length, 1, cv.CV_32SC2, points.flat());
    }

    if (coords.rows === 0) {
      // No points found, return original
      src.delete(); gray.delete(); thresh.delete();
      coords.delete();
      return buffer;
    }

    const rotatedRect = cv.minAreaRect(coords);
    let angle = rotatedRect.angle;
    if (angle < -45) angle = -(90 + angle);   // convertir a rango [-45,45]

    const center = new cv.Point(src.cols/2, src.rows/2);
    const M = cv.getRotationMatrix2D(center, angle, 1);
    const rotated = new cv.Mat();
    cv.warpAffine(src, rotated, M, new cv.Size(src.cols, src.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    const out = await sharp(Buffer.from(rotated.data), {raw:{width:rotated.cols, height:rotated.rows, channels:4}}).jpeg().toBuffer();
    
    // Clean up
    src.delete(); 
    gray.delete(); 
    thresh.delete(); 
    coords.delete();
    M.delete();
    rotated.delete();
    
    return out;
  } catch (error) {
    console.error('Error in deskew function:', error.message);
    console.log('Returning original buffer due to deskew error.');
    return buffer; // Return original buffer on any error
  }
}

async function processImage(imageBuffer, filename) {
  try {
    console.log(`Iniciando procesamiento de ${filename}`);
    
    // Primero intentar con Mistral OCR
    console.log(`Intentando extracción con Mistral OCR para ${filename}`);
    const mistralResult = await processImageWithMistral(imageBuffer, filename);
    if (mistralResult) {
      console.log(`Mistral logró extraer el número de checklist para ${filename}: ${mistralResult.checklistNumber}`);
      return mistralResult;
    }
    
    // Si Mistral falla, usar el método tradicional como fallback
    console.log(`Mistral falló, intentando con métodos tradicionales para ${filename}`);
    let bufferToProcess = await deskew(imageBuffer);
    
    // --- Inicio: Lógica de recorte inteligente --- 
    // let bufferToProcess = imageBuffer; // Original line, now deskewed buffer is used
    let cropRegion = null;
    try {
      // Primero, un OCR rápido sobre una versión reducida para encontrar la zona de "Checklist"
      const preliminaryOcrImage = await sharp(imageBuffer)
        .resize({ width: 1500, fit: 'inside', withoutEnlargement: true })
        .greyscale()
        .normalize()
        .toBuffer();

      const { data: { text: preliminaryText } } = await Tesseract.recognize(preliminaryOcrImage, 'spa', {
        tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
      });
      
      console.log(`Texto preliminar para recorte (primeros 300 chars): ${preliminaryText.substring(0,300)}`);

      const keywords = ['checklist n', 'checklistn', 'check list n', 'checklista', 'checklist nº', 'checklist n°'];
      let keywordYPosition = -1;
      let keywordXPosition = -1;
      const lines = preliminaryText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        for (const keyword of keywords) {
          const xIndex = line.indexOf(keyword);
          if (xIndex !== -1) {
            keywordYPosition = i; // Aproximación de la línea
            keywordXPosition = xIndex; // Aproximación de la columna
            console.log(`Palabra clave '${keyword}' encontrada en línea ${i}, posición ~${xIndex}`);
            break;
          }
        }
        if (keywordYPosition !== -1) break;
      }

      if (keywordYPosition !== -1) {
        const { width, height } = await sharp(imageBuffer).metadata();
        const estimatedLineHeight = height / lines.length; // Altura estimada por línea
        
        // Definir la región de recorte (ROI - Region Of Interest)
        // Queremos un área alrededor y debajo de la palabra clave
        const roiTop = Math.max(0, Math.floor(keywordYPosition * estimatedLineHeight - estimatedLineHeight * 0.5)); // Un poco antes de la línea
        const roiHeight = Math.min(height - roiTop, Math.floor(estimatedLineHeight * 3)); // Unas 3 líneas de altura
        const roiLeft = Math.max(0, Math.floor(keywordXPosition * (width / (lines[keywordYPosition]?.length || width)) - (width * 0.1) )); // Un poco antes de la palabra clave
        const roiWidth = Math.min(width - roiLeft, Math.floor(width * 0.8)); // Ancho considerable desde la palabra clave

        if (roiWidth > 0 && roiHeight > 0 && roiTop < height && roiLeft < width) {
            cropRegion = { left: roiLeft, top: roiTop, width: roiWidth, height: roiHeight };
            console.log('Región de recorte calculada:', cropRegion);
            bufferToProcess = await sharp(imageBuffer).extract(cropRegion).toBuffer();
            // fs.writeFileSync(join(__dirname, `cropped_${filename}`), bufferToProcess); // Para depuración
            console.log('Imagen recortada para procesamiento detallado.');
        } else {
            console.log('No se pudo calcular una región de recorte válida. Usando imagen completa.');
            cropRegion = null;
        }
      } else {
        console.log('No se encontró la palabra clave "Checklist" para el recorte. Usando imagen completa.');
      }
    } catch (e) {
      console.error('Error durante el intento de recorte inteligente:', e.message);
      // Si falla el recorte, continuamos con la imagen completa
      bufferToProcess = imageBuffer;
      cropRegion = null;
    }
    // --- Fin: Lógica de recorte inteligente ---

    const rotations = [0, 90, 180, 270];
    const processingOptions = rotations.flatMap(angle => ([
      {
        name: `soft_rot${angle}`,
        appliesToCropped: false,
        process: buf => sharp(buf).rotate(angle).greyscale().normalize().sharpen().toBuffer()
      },
      {
        name: `cropped_soft_rot${angle}`,
        appliesToCropped: true,
        process: buf => sharp(buf).rotate(angle).resize({width:2200,height:900,fit:'contain'}).greyscale().normalize().sharpen().toBuffer()
      }
    ]));

    let bestResult = null;
    let bestConfidence = -1;
    let bestTextForDebug = '';

    for (const option of processingOptions) {
      // Aplicar opción solo si es para imagen recortada y tenemos una, o si es para imagen completa
      if ((option.appliesToCropped && cropRegion) || (!option.appliesToCropped && !cropRegion)) {
        try {
          console.log(`Probando procesamiento: ${option.name}`);
          // Usar bufferToProcess (que puede ser la imagen original o la recortada)
          const processedImage = await option.process(bufferToProcess);
          // fs.writeFileSync(join(__dirname, `processed_${option.name}_${filename}`), processedImage); // Para depuración

          const { data: { text, confidence } } = await Tesseract.recognize(
            processedImage,
            'spa+eng',
            {
              tessedit_pageseg_mode: 6, // Changed from: option.name.startsWith('cropped') ? 7 : 6,
              // tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzº°#:.- ', // Removed whitelist
              tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY
            }
          );
          
          console.log(`${option.name} - Confianza OCR: ${confidence}%`);
          console.log(`${option.name} - Texto OCR (primeros 100): ${text.substring(0, 100)}...`);

          const checklistNumber = extractChecklistNumber(text);
          
          if (checklistNumber) {
            if (!bestResult || confidence > bestConfidence) {
              bestResult = {
                filename,
                checklistNumber,
                extractedText: text.substring(0, 1000),
                confidence: confidence,
                processingMethod: option.name,
                wasCropped: !!cropRegion,
                cropRegion: cropRegion,
                success: true
              };
              bestConfidence = confidence;
              bestTextForDebug = text;
              console.log(`Nuevo mejor resultado con ${option.name}: ${checklistNumber}, Confianza: ${confidence}`);
            }
          } else if (!bestResult && confidence > bestConfidence) {
              bestConfidence = confidence;
              bestTextForDebug = text;
          }

        } catch (error) {
          console.error(`Error en procesamiento ${option.name} para ${filename}:`, error.message);
        }
      } else if (option.appliesToCropped && !cropRegion) {
        console.log(`Omitiendo opción de recorte ${option.name} porque no se pudo recortar la imagen.`);
      }
    }

    if (bestResult) {
      console.log(`Mejor resultado final para ${filename}: ${bestResult.checklistNumber} (Método: ${bestResult.processingMethod}, Cropped: ${bestResult.wasCropped}, Confianza OCR: ${bestResult.confidence}%)`);
      return bestResult;
    } else {
      console.log(`No se pudo extraer número de checklist para ${filename} con métodos tradicionales. Intentando con OpenAI...`);
      console.log(`Texto con mayor confianza (${bestConfidence}%) para depuración: ${bestTextForDebug.substring(0,300)}`);
      
      // Intentar con OpenAI si los métodos tradicionales fallan
      const openaiResult = await processImageWithOpenAI(imageBuffer, filename);
      if (openaiResult) {
        console.log(`OpenAI logró extraer el número de checklist para ${filename}: ${openaiResult.checklistNumber}`);
        return openaiResult;
      }
      
      // Si OpenAI también falla, devolver error
      console.log(`Ni los métodos tradicionales ni OpenAI pudieron extraer el número de checklist para ${filename}`);
      return {
        filename,
        checklistNumber: null,
        error: 'No se pudo extraer número de checklist con ningún método (OCR tradicional + OpenAI).',
        extractedText: bestTextForDebug.substring(0,1000),
        wasCropped: !!cropRegion,
        cropRegion: cropRegion,
        success: false
      };
    }

  } catch (error) {
    console.error(`Error general procesando ${filename}:`, error);
    return {
      filename,
      checklistNumber: null,
      error: error.message,
      wasCropped: false, // Asegurarse de que estos campos existan incluso en error general
      cropRegion: null,
      success: false
    };
  }
}

// Rutas básicas
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor backend funcionando correctamente',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      processImages: 'POST /api/process-images'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'El servidor está funcionando',
    port: PORT
  });
});

// Nueva ruta para procesar imágenes
app.post('/api/process-images', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No se enviaron imágenes',
        message: 'Debes enviar al menos una imagen'
      });
    }

    console.log(`Procesando ${req.files.length} imágenes...`);

    // Procesar todas las imágenes en paralelo
    const results = await Promise.all(
      req.files.map(file => processImage(file.buffer, file.originalname))
    );

    // Filtrar resultados exitosos
    const successfulResults = results.filter(result => result.success);
    const failedResults = results.filter(result => !result.success);
    const mistralResults = successfulResults.filter(result => result.processingMethod === 'mistral_ocr');
    const openaiResults = successfulResults.filter(result => result.processingMethod === 'openai_vision');
    const traditionalResults = successfulResults.filter(result => 
      result.processingMethod !== 'mistral_ocr' && result.processingMethod !== 'openai_vision'
    );
    
    res.json({
      message: 'Procesamiento completado',
      totalImages: req.files.length,
      successfulExtractions: successfulResults.length,
      failedExtractions: failedResults.length,
      mistralOcrSuccess: mistralResults.length,
      traditionalOcrSuccess: traditionalResults.length,
      openaiSuccess: openaiResults.length,
      results: results,
      checklistNumbers: successfulResults.map(r => ({
        filename: r.filename,
        checklistNumber: r.checklistNumber,
        method: r.processingMethod
      }))
    });

  } catch (error) {
    console.error('Error en el procesamiento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Ruta de ejemplo para API
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Esta es una ruta de prueba',
    data: {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url
    }
  });
});

// Manejo de errores de multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Archivo demasiado grande',
        message: 'El tamaño máximo permitido es 10MB'
      });
    }
  }
  
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      error: 'Tipo de archivo no válido',
      message: 'Solo se permiten archivos de imagen'
    });
  }
  
  next(error);
});

// Manejo de errores 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    message: `La ruta ${req.originalUrl} no existe en este servidor`
  });
});

// Iniciar el servidor (revert to simple listen)
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📊 Health check disponible en http://localhost:${PORT}/api/health`);
  console.log(`🖼️  API de procesamiento de imágenes: POST http://localhost:${PORT}/api/process-images`);
});

// REMOVE startServer function and its call
// async function startServer() {
//   await cvReady;
//   app.listen(PORT, () => {
//     console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
//     console.log(`📊 Health check disponible en http://localhost:${PORT}/api/health`);
//     console.log(`🖼️  API de procesamiento de imágenes: POST http://localhost:${PORT}/api/process-images`);
//   });
// }
// startServer();

// Función para validar y corregir números de checklist
function validateAndCorrectChecklistNumber(number) {
  if (!number || typeof number !== 'string' || number.length !== 6) {
    console.log(`Número "${number}" no es válido (tipo: ${typeof number}, longitud: ${number?.length}), no se aplican correcciones.`);
    return number;
  }
  
  const corrections = {
    '8': '5', 'B': '5', // B y 8 a 5
    '5': 'S', // 5 a S (menos común, pero posible)
    '6': 'G', // 6 a G
    '0': 'O', 'o': 'O', // 0, o a O (unificar a O mayúscula)
    '1': 'I', 'l': 'I', // 1, l a I (unificar a I mayúscula)
    '2': 'Z', // 2 a Z
    '4': 'A', // 4 a A
    '7': 'T', // 7 a T
    '9': 'g'  // 9 a g (minúscula)
    // Añadir más según sea necesario
  };
  
  let correctedNumberArray = number.split('');
  let correctionsAppliedCount = 0;

  console.log(`Validando número: ${number}`);

  for (let i = 0; i < correctedNumberArray.length; i++) {
    const digit = correctedNumberArray[i];
    if (corrections[digit]) {
      // Aplicar corrección solo si el resultado es un dígito numérico
      // Esto es para evitar convertir, por ejemplo, 'S' a '5' y luego '5' de nuevo a 'S'
      // O si la corrección es a una letra que no queremos en el número final.
      // Por ahora, asumimos que las correcciones son para mejorar la lectura de dígitos.
      console.log(`Aplicando corrección: '${digit}' -> '${corrections[digit]}' en la posición ${i}`);
      correctedNumberArray[i] = corrections[digit];
      correctionsAppliedCount++;
    }
  }
  
  const finalCorrectedNumber = correctedNumberArray.join('');
  
  if (correctionsAppliedCount > 0) {
    console.log(`Número después de ${correctionsAppliedCount} correcciones: ${finalCorrectedNumber}`);
  } else {
    console.log(`No se aplicaron correcciones al número: ${finalCorrectedNumber}`);
  }
  
  // Asegurarse de que el resultado final solo contenga dígitos si es un número de checklist
  if(/^\d{6}$/.test(finalCorrectedNumber)){
      return finalCorrectedNumber;
  } else {
      console.log(`El número corregido "${finalCorrectedNumber}" no es una secuencia de 6 dígitos. Devolviendo original: ${number}`);
      // Si la corrección resultó en algo no numérico, podría ser mejor devolver el original
      // o manejarlo de otra forma. Por ahora, devolvemos el original si la corrección lo 'rompe'.
      return number; 
  }
}

// Función para procesar imagen con Mistral OCR (CORREGIDA)
// Función para procesar imagen con Mistral OCR (ACTUALIZADA)
async function processImageWithMistral(imageBuffer, filename) {
  try {
    console.log(`Intentando extraer número de checklist con Mistral OCR para ${filename}`);

    // Convertir buffer a base64
    const base64Image = imageBuffer.toString('base64');

    const response = await mistral.chat.complete({
      model: "pixtral-12b-latest",          // o "pixtral-12b-2409"
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analiza esta imagen y extrae únicamente el número de checklist. " +
                "Busca texto que contenga 'Checklist N°', 'Checklist Nº', 'Checklist N', " +
                "o variaciones similares, seguido de un número de 5-7 dígitos. " +
                "Responde SOLO con el número encontrado, sin texto adicional. " +
                "Si no encuentras un número de checklist válido, responde 'NO_ENCONTRADO'."
            },
            {
              type: "image_url",
              imageUrl: `data:image/jpeg;base64,${base64Image}`  // <- camelCase
            }
          ]
        }
      ],
      max_tokens: 50
    });

    const extractedText = response.choices?.[0]?.message?.content?.trim();
    console.log(`Respuesta de Mistral para ${filename}: ${extractedText}`);

    if (extractedText && extractedText !== "NO_ENCONTRADO") {
      const cleanNumber = extractedText.replace(/[^0-9]/g, "");
      if (cleanNumber.length >= 5 && cleanNumber.length <= 7) {
        const fixedNumber = fix(cleanNumber);      // usa tu función fix()
        console.log(`Mistral extrajo número de checklist: ${fixedNumber} para ${filename}`);
        return {
          filename,
          checklistNumber: fixedNumber,
          extractedText,
          confidence: 90,
          processingMethod: "mistral_ocr",
          wasCropped: false,
          cropRegion: null,
          success: true
        };
      }
    }

    console.log(`Mistral no pudo extraer un número válido de checklist para ${filename}`);
    return null;
  } catch (error) {
    console.error(`Error procesando ${filename} con Mistral:`, error.message);
    return null;
  }
}

// Configurar Mistral
const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});