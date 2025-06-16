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
    fileSize: 500 * 1024 * 1024, // 500MB límite
  },
  fileFilter: (req, file, cb) => {
    console.log(`Archivo recibido: ${file.originalname}, campo: ${file.fieldname}, tipo: ${file.mimetype}`);
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Configuración alternativa de multer que acepta cualquier campo
const uploadAny = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB límite
  },
  fileFilter: (req, file, cb) => {
    console.log(`Archivo recibido (any): ${file.originalname}, campo: ${file.fieldname}, tipo: ${file.mimetype}`);
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
    
    // Solo usar Mistral OCR (sin fallback a métodos tradicionales)
    console.log(`Intentando extracción con Mistral OCR para ${filename}`);
    const mistralResult = await processImageWithMistral(imageBuffer, filename);
    if (mistralResult) {
      console.log(`Mistral logró extraer el número de checklist para ${filename}: ${mistralResult.checklistNumber}`);
      return mistralResult;
    }
    
    // Si Mistral falla, devolver error directamente (sin procesamiento tradicional)
    console.log(`Mistral no pudo extraer número de checklist para ${filename}`);
    return {
      filename,
      checklistNumber: null,
      error: 'No se pudo extraer número de checklist con Mistral OCR.',
      extractedText: '',
      wasCropped: false,
      cropRegion: null,
      success: false
    };
    


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
app.post('/api/process-images', (req, res, next) => {
  // Log para debugging
  console.log('Headers recibidos:', req.headers);
  console.log('Content-Type:', req.get('Content-Type'));
  
  // Intentar primero con el campo 'images'
  upload.array('images', 5000)(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      console.log('Campo "images" no encontrado, intentando con uploadAny...');
      // Si falla por campo inesperado, intentar con uploadAny
      uploadAny.any()(req, res, (err2) => {
        if (err2) {
          console.error('Error de multer (uploadAny):', err2);
          return next(err2);
        }
        console.log('Archivos procesados con uploadAny');
        next();
      });
    } else if (err) {
      console.error('Error de multer:', err);
      return next(err);
    } else {
      console.log('Archivos procesados con upload.array');
      next();
    }
  });
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No se enviaron imágenes',
        message: 'Debes enviar al menos una imagen. Asegúrate de que el campo se llame "images" o que los archivos sean válidos.'
      });
    }

    console.log(`Procesando ${req.files.length} imágenes en lotes de 5...`);

    // Procesar imágenes en lotes de 5 con pausas
    const batchSize = 5;
    const results = [];
    
    for (let i = 0; i < req.files.length; i += batchSize) {
      const batch = req.files.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(req.files.length / batchSize);
      
      console.log(`Procesando lote ${batchNumber}/${totalBatches} (${batch.length} imágenes)...`);
      
      // Procesar el lote actual en paralelo
      const batchResults = await Promise.all(
        batch.map(file => processImage(file.buffer, file.originalname))
      );
      
      results.push(...batchResults);
      
      console.log(`Lote ${batchNumber}/${totalBatches} completado.`);
      
      // Pausa entre lotes (excepto en el último lote)
      if (i + batchSize < req.files.length) {
        console.log('Pausando 3 segundos antes del siguiente lote...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`Procesamiento completo: ${results.length} imágenes procesadas.`);

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
        method: r.processingMethod,
        retryAttempt: r.retryAttempt || 1,
        processingConfig: r.processingConfig || 'standard',
        wasCropped: r.wasCropped || false,
        rotation: r.rotation || 0,
        confidence: r.confidence || 0
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
        message: 'El tamaño máximo permitido es 500MB'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Campo de archivo inesperado',
        message: 'El campo de archivo debe llamarse "images". Verifica que estés enviando los archivos con el nombre de campo correcto.',
        expectedField: 'images',
        receivedField: error.field || 'desconocido'
      });
    }
    // Manejar otros errores de multer
    return res.status(400).json({
      error: 'Error de subida de archivo',
      message: error.message,
      code: error.code
    });
  }
  
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      error: 'Tipo de archivo no válido',
      message: 'Solo se permiten archivos de imagen'
    });
  }
  
  // Manejar errores generales
  console.error('Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: 'Ha ocurrido un error inesperado'
  });
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
// Función para detectar y recortar el área del papel
async function detectAndCropPaper(imageBuffer) {
  try {
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    // Convertir a escala de grises y aplicar detección de bordes
    const edgeDetected = await image
      .greyscale()
      .normalize()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Kernel de detección de bordes
      })
      .threshold(50)
      .toBuffer();
    
    // Buscar el rectángulo más grande (probablemente el papel)
    // Esto es una aproximación simple - en un caso real usarías OpenCV
    const cropRegion = {
      left: Math.floor(width * 0.05),
      top: Math.floor(height * 0.05),
      width: Math.floor(width * 0.9),
      height: Math.floor(height * 0.9)
    };
    
    const croppedImage = await sharp(imageBuffer)
      .extract(cropRegion)
      .toBuffer();
    
    return {
      croppedImage,
      cropRegion,
      wasCropped: true
    };
  } catch (error) {
    console.log('Error en detección de papel, usando imagen completa:', error.message);
    return {
      croppedImage: imageBuffer,
      cropRegion: null,
      wasCropped: false
    };
  }
}

// Función para rotar imagen
async function rotateImage(imageBuffer, degrees) {
  try {
    return await sharp(imageBuffer)
      .rotate(degrees, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
  } catch (error) {
    console.log(`Error rotando imagen ${degrees}°:`, error.message);
    return imageBuffer;
  }
}

async function processImageWithMistral(imageBuffer, filename, retryAttempt = 0) {
  const maxRetries = 6; // Aumentado a 6 intentos
  const rotations = [0, 90, 180, 270, -15, 15]; // Diferentes rotaciones
  const processingConfigs = [
    // Configuración estándar
    {
      resize: { width: 2000, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: true,
      quality: 95,
      name: "estándar",
      detectPaper: false
    },
    // Configuración con detección de papel
    {
      resize: { width: 2500, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: { sigma: 1.2 },
      quality: 98,
      name: "detección de papel",
      detectPaper: true
    },
    // Configuración de alta resolución
    {
      resize: { width: 3000, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: { sigma: 1.5 },
      contrast: 1.2,
      brightness: 1.1,
      quality: 98,
      name: "alta resolución",
      detectPaper: false
    },
    // Configuración para texto difícil
    {
      resize: { width: 2500, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: { sigma: 2 },
      contrast: 1.5,
      threshold: 128,
      quality: 100,
      name: "texto difícil",
      detectPaper: true
    },
    // Configuración con rotación y detección
    {
      resize: { width: 2200, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: { sigma: 1.8 },
      contrast: 1.3,
      quality: 97,
      name: "rotación y detección",
      detectPaper: true,
      useRotation: true
    },
    // Configuración extrema
    {
      resize: { width: 3500, fit: 'inside', withoutEnlargement: true },
      greyscale: true,
      normalize: true,
      sharpen: { sigma: 2.5 },
      contrast: 1.8,
      brightness: 1.2,
      threshold: 100,
      quality: 100,
      name: "extrema",
      detectPaper: true,
      useRotation: true
    }
  ];

  try {
    const config = processingConfigs[retryAttempt] || processingConfigs[0];
    console.log(`Intento ${retryAttempt + 1}/${maxRetries} con configuración ${config.name} para ${filename}`);

    let workingBuffer = imageBuffer;
    let cropInfo = { wasCropped: false, cropRegion: null };

    // Paso 1: Detección y recorte de papel si está habilitado
    if (config.detectPaper) {
      console.log(`Detectando área del papel para ${filename}...`);
      const paperDetection = await detectAndCropPaper(workingBuffer);
      workingBuffer = paperDetection.croppedImage;
      cropInfo = {
        wasCropped: paperDetection.wasCropped,
        cropRegion: paperDetection.cropRegion
      };
      if (paperDetection.wasCropped) {
        console.log(`Papel detectado y recortado para ${filename}`);
      }
    }

    // Paso 2: Rotación si está habilitada
    if (config.useRotation && retryAttempt < rotations.length) {
      const rotation = rotations[retryAttempt];
      if (rotation !== 0) {
        console.log(`Aplicando rotación de ${rotation}° para ${filename}...`);
        workingBuffer = await rotateImage(workingBuffer, rotation);
      }
    }

    // Paso 3: Preprocesar la imagen con la configuración específica
    let imageProcessor = sharp(workingBuffer)
      .resize(config.resize);

    if (config.greyscale) imageProcessor = imageProcessor.greyscale();
    if (config.normalize) imageProcessor = imageProcessor.normalize();
    if (config.sharpen) imageProcessor = imageProcessor.sharpen(config.sharpen);
    if (config.contrast) imageProcessor = imageProcessor.modulate({ brightness: config.brightness || 1, contrast: config.contrast });
    if (config.threshold) imageProcessor = imageProcessor.threshold(config.threshold);

    const processedImage = await imageProcessor
      .jpeg({ quality: config.quality })
      .toBuffer();

    // Convertir buffer procesado a base64
    const base64Image = processedImage.toString('base64');

    // Prompts progresivamente más específicos y adaptados
    const prompts = [
      // Intento 1: Búsqueda estándar
      "Examina cuidadosamente esta imagen y busca un número de checklist. " +
      "Busca texto como: 'Checklist N°', 'Checklist Nº', 'Checklist N', 'Checklist No', " +
      "'Check List N°', 'CHECKLIST N°', o cualquier variación similar. " +
      "El número debe tener entre 5 y 7 dígitos. " +
      "Examina toda la imagen, incluyendo esquinas, bordes y áreas con texto pequeño. " +
      "Si encuentras el número, responde ÚNICAMENTE con esos dígitos. " +
      "Si no encuentras ningún número de checklist, responde exactamente 'NO_ENCONTRADO'.",
      
      // Intento 2: Con detección de papel
      "Esta imagen muestra un documento o papel. Busca un número de checklist de 5-7 dígitos. " +
      "El número puede aparecer cerca de palabras como: 'Checklist', 'Check', 'List', 'N°', 'Nº', 'No', 'Número'. " +
      "Busca en TODA la superficie del papel: encabezados, pies de página, márgenes, esquinas. " +
      "El número puede estar en diferentes formatos: 123456, 12-34-56, 12.34.56, etc. " +
      "Responde SOLO con los dígitos del número encontrado, sin espacios ni símbolos. " +
      "Si no encuentras nada, responde 'NO_ENCONTRADO'.",
      
      // Intento 3: Alta resolución
      "Analiza esta imagen de alta resolución buscando un número de checklist. " +
      "Busca CUALQUIER secuencia de 5, 6 o 7 dígitos consecutivos. " +
      "Examina texto pequeño, códigos, sellos, firmas, watermarks. " +
      "El número puede estar en cualquier orientación o tamaño. " +
      "Lista el primer número de 5-7 dígitos que encuentres. " +
      "Si no encuentras ninguno, responde 'NO_ENCONTRADO'.",
      
      // Intento 4: Texto difícil con umbralización
      "Esta imagen ha sido procesada para mejorar la legibilidad del texto. " +
      "Busca números de checklist que pueden estar borrosos, desenfocados o con poco contraste. " +
      "Busca secuencias de 5-7 dígitos cerca de palabras relacionadas con 'checklist'. " +
      "El texto puede aparecer distorsionado pero los números deben ser reconocibles. " +
      "Responde con el número encontrado o 'NO_ENCONTRADO'.",
      
      // Intento 5: Con rotación
      "Esta imagen puede estar rotada. Busca un número de checklist considerando que el texto " +
      "puede estar en diferentes orientaciones. Busca números de 5-7 dígitos que aparezcan " +
      "cerca de texto que pueda decir 'Checklist', 'Check List', o variaciones similares. " +
      "El documento puede estar girado, pero los números deben ser legibles. " +
      "Responde solo con los dígitos encontrados o 'NO_ENCONTRADO'.",
      
      // Intento 6: Búsqueda extrema
      "ANÁLISIS EXHAUSTIVO: Examina cada píxel de esta imagen buscando CUALQUIER número de 5-7 dígitos. " +
      "Ignora completamente el contexto. Solo busca secuencias numéricas. " +
      "Pueden estar en: códigos de barras, sellos, firmas, fondos, bordes, esquinas, " +
      "texto pequeño, borroso, rotado, parcialmente oculto o cortado. " +
      "Lista TODOS los números de 5-7 dígitos que encuentres, separados por comas. " +
      "Si no encuentras absolutamente ninguno, responde 'NO_ENCONTRADO'."
    ];

    const response = await mistral.chat.complete({
      model: "pixtral-12b-latest",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompts[retryAttempt] || prompts[0]
            },
            {
              type: "image_url",
              imageUrl: `data:image/jpeg;base64,${base64Image}`
            }
          ]
        }
      ],
      max_tokens: 150
    });

    const extractedText = response.choices?.[0]?.message?.content?.trim();
    console.log(`Respuesta de Mistral (intento ${retryAttempt + 1}) para ${filename}: ${extractedText}`);

    if (extractedText && extractedText !== "NO_ENCONTRADO") {
      // Buscar números en la respuesta de manera más flexible
      const numberMatches = extractedText.match(/\d{5,7}/g);
      
      if (numberMatches && numberMatches.length > 0) {
        // Tomar el primer número válido encontrado
        const cleanNumber = numberMatches[0];
        const fixedNumber = fix(cleanNumber);
        console.log(`Mistral extrajo número de checklist: ${fixedNumber} para ${filename} (intento ${retryAttempt + 1})`);
        return {
          filename,
          checklistNumber: fixedNumber,
          extractedText,
          confidence: 90 - (retryAttempt * 3), // Reducir confianza gradualmente
          processingMethod: `mistral_ocr_attempt_${retryAttempt + 1}`,
          wasCropped: cropInfo.wasCropped,
          cropRegion: cropInfo.cropRegion,
          rotation: config.useRotation && retryAttempt < rotations.length ? rotations[retryAttempt] : 0,
          processingConfig: config.name,
          success: true,
          retryAttempt: retryAttempt + 1
        };
      }
      
      // Si no hay números de 5-7 dígitos, intentar extraer cualquier número y limpiarlo
      const allNumbers = extractedText.replace(/[^0-9]/g, "");
      if (allNumbers.length >= 5 && allNumbers.length <= 7) {
        const fixedNumber = fix(allNumbers);
        console.log(`Mistral extrajo número de checklist (limpiado): ${fixedNumber} para ${filename} (intento ${retryAttempt + 1})`);
        return {
          filename,
          checklistNumber: fixedNumber,
          extractedText,
          confidence: 85 - (retryAttempt * 3),
          processingMethod: `mistral_ocr_attempt_${retryAttempt + 1}`,
          wasCropped: cropInfo.wasCropped,
          cropRegion: cropInfo.cropRegion,
          rotation: config.useRotation && retryAttempt < rotations.length ? rotations[retryAttempt] : 0,
          processingConfig: config.name,
          success: true,
          retryAttempt: retryAttempt + 1
        };
      }
    }

    // Si este intento falló y aún hay reintentos disponibles
    if (retryAttempt < maxRetries - 1) {
      console.log(`Intento ${retryAttempt + 1} falló para ${filename}, probando con configuración diferente...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa de 1 segundo
      return await processImageWithMistral(imageBuffer, filename, retryAttempt + 1);
    }

    console.log(`Todos los intentos fallaron para ${filename}`);
    return null;
  } catch (error) {
    console.error(`Error en intento ${retryAttempt + 1} procesando ${filename} con Mistral:`, error.message);
    
    // Si hay error y aún quedan reintentos
    if (retryAttempt < maxRetries - 1) {
      console.log(`Error en intento ${retryAttempt + 1}, reintentando...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa más larga en caso de error
      return await processImageWithMistral(imageBuffer, filename, retryAttempt + 1);
    }
    
    return null;
  }
}

// Configurar Mistral
const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});