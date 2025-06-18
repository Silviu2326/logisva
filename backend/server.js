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
// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://logisvaa-fa905005c15b.herokuapp.com',
    'https://logisva.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-Id']
}));
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
  let workingBuffer = null;
  let processedImage = null;
  
  try {
    console.log(`Iniciando procesamiento optimizado de ${filename}`);
    
    // Verificar tamaño del buffer antes de procesar
    const bufferSizeMB = imageBuffer.length / (1024 * 1024);
    console.log(`Tamaño de imagen ${filename}: ${bufferSizeMB.toFixed(2)} MB`);
    
    // Limitar tamaño de imagen para evitar problemas de memoria
    if (bufferSizeMB > 50) {
      console.log(`Imagen ${filename} demasiado grande (${bufferSizeMB.toFixed(2)} MB), redimensionando...`);
      try {
        processedImage = await sharp(imageBuffer)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        workingBuffer = processedImage;
        processedImage = null; // Liberar referencia inmediatamente
      } catch (resizeError) {
        console.error(`Error redimensionando ${filename}:`, resizeError.message);
        workingBuffer = Buffer.from(imageBuffer);
      }
    } else {
      // Crear una copia del buffer para trabajar
      workingBuffer = Buffer.from(imageBuffer);
    }
    
    // Solo usar Mistral OCR (sin fallback a métodos tradicionales)
    console.log(`Intentando extracción con Mistral OCR para ${filename}`);
    const mistralResult = await processImageWithMistral(workingBuffer, filename);
    
    // Liberar buffer de trabajo inmediatamente después del procesamiento
    workingBuffer = null;
    
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
      wasCropped: false,
      cropRegion: null,
      success: false
    };
  } finally {
    // Asegurar liberación completa de memoria
    workingBuffer = null;
    processedImage = null;
    
    // Forzar liberación de memoria después de cada imagen
    if (global.gc) {
      global.gc();
      console.log(`Memoria liberada después de procesar ${filename}`);
    }
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

// Función simplificada para logging (sin SSE)
function logProgress(sessionId, data) {
  console.log(`[${sessionId}] ${data.stage}: ${data.message}`);
}

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
  const sessionId = req.headers['x-session-id'] || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const processingStartTime = Date.now();
  
  console.log(`Iniciando procesamiento para sessionId: ${sessionId}`);
  
  try {
    // Verificar API keys
    if (!process.env.MISTRAL_API_KEY) {
      console.error('❌ MISTRAL_API_KEY no está configurada');
      return res.status(500).json({
        error: 'Configuración del servidor incompleta',
        message: 'La clave API de Mistral no está configurada. Contacta al administrador.'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      console.log('❌ No se recibieron archivos');
      return res.status(400).json({
        error: 'No se enviaron imágenes',
        message: 'Debes enviar al menos una imagen. Asegúrate de que el campo se llame "images" o que los archivos sean válidos.'
      });
    }

    // Limitar el número de imágenes por lote para evitar problemas de memoria
    const maxImagesPerBatch = 5;
    if (req.files.length > maxImagesPerBatch) {
      return res.status(400).json({
        error: 'Demasiadas imágenes',
        message: `Por favor, procesa máximo ${maxImagesPerBatch} imágenes a la vez para evitar problemas de memoria.`,
        receivedImages: req.files.length,
        maxAllowed: maxImagesPerBatch
      });
    }
    
    console.log(`Procesando ${req.files.length} imágenes...`);

    // Procesar imágenes de una en una para optimizar memoria
    const results = [];
    const totalImages = req.files.length;
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const imageIndex = i + 1;
      
      console.log(`Procesando imagen ${imageIndex}/${totalImages}: ${file.originalname}`);
      
      try {
        // Procesar la imagen
        const result = await processImage(file.buffer, file.originalname);
        results.push(result);
        
        console.log(`Imagen ${imageIndex}/${totalImages} procesada: ${result.success ? 'Éxito' : 'Error'}`);
        
      } catch (error) {
        console.error(`Error procesando imagen ${imageIndex}: ${error.message}`);
        const errorResult = {
          filename: file.originalname,
          checklistNumber: null,
          error: error.message,
          success: false,
          wasCropped: false,
          cropRegion: null,
          processingMethod: 'error',
          confidence: 0
        };
        results.push(errorResult);
      }
      
      // Pausa entre imágenes para optimizar memoria
      if (i < req.files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Forzar liberación de memoria cada imagen
      if (global.gc) {
        global.gc();
      }
    }
    
    console.log(`Procesamiento completo: ${results.length} imágenes procesadas.`);
    
    // Filtrar resultados exitosos
    const successfulResults = results.filter(result => result.success);
    const failedResults = results.filter(result => !result.success);
    const mistralResults = successfulResults.filter(result => result.processingMethod === 'mistral_ocr');
    const openaiResults = successfulResults.filter(result => result.processingMethod === 'openai_vision');
    
    const processingTime = Date.now() - processingStartTime;
    
    const finalResponse = {
      success: true,
      message: 'Procesamiento completado',
      sessionId: sessionId,
      totalImages: req.files.length,
      successfulExtractions: successfulResults.length,
      failedExtractions: failedResults.length,
      mistralOcrSuccess: mistralResults.length,
      openaiSuccess: openaiResults.length,
      processingTimeMs: processingTime,
      processingTimeSec: Math.round(processingTime / 1000),
      results: results,
      checklistNumbers: successfulResults.map(r => ({
        filename: r.filename,
        checklistNumber: r.checklistNumber,
        method: r.processingMethod,
        confidence: r.confidence || 0
      }))
    };
    
    console.log(`Procesamiento completado: ${successfulResults.length}/${totalImages} imágenes exitosas en ${Math.round(processingTime / 1000)}s`);
    
    res.json(finalResponse);

  } catch (error) {
    console.error('Error en el procesamiento:', error);
    
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      sessionId: sessionId
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
// Función para detectar y recortar el área del papel (optimizada para memoria)
async function detectAndCropPaper(imageBuffer) {
  let edgeDetected = null;
  let image = null;
  let croppedImage = null;
  
  try {
    image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    // Convertir a escala de grises y aplicar detección de bordes
    edgeDetected = await image
      .greyscale()
      .normalize()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Kernel de detección de bordes
      })
      .threshold(50)
      .toBuffer();
    
    // Liberar imagen original inmediatamente
    image = null;
    
    // Buscar el rectángulo más grande (probablemente el papel)
    // Esto es una aproximación simple - en un caso real usarías OpenCV
    const cropRegion = {
      left: Math.floor(width * 0.05),
      top: Math.floor(height * 0.05),
      width: Math.floor(width * 0.9),
      height: Math.floor(height * 0.9)
    };
    
    croppedImage = await sharp(imageBuffer)
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
  } finally {
    // Liberar memoria
    edgeDetected = null;
    image = null;
    croppedImage = null;
    if (global.gc) {
      global.gc();
    }
  }
}

// Función para rotar imagen (optimizada para memoria)
async function rotateImage(imageBuffer, degrees) {
  let rotatedBuffer = null;
  
  try {
    rotatedBuffer = await sharp(imageBuffer)
      .rotate(degrees, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    
    return rotatedBuffer;
    
  } catch (error) {
    console.log(`Error rotando imagen ${degrees}°:`, error.message);
    return imageBuffer;
  } finally {
    // Liberar memoria si hay error
    if (global.gc) {
      global.gc();
    }
  }
}

async function processImageWithMistral(imageBuffer, filename) {
  let workingBuffer = null;
  let processedImage = null;
  let base64Image = null;
  
  // Reducir número de intentos para evitar timeouts
  const maxRetries = 3;
  const retryConfigs = [
    { name: 'estándar', enhance: false, crop: false, rotate: 0, resolution: 'normal' },
    { name: 'mejorado', enhance: true, crop: false, rotate: 0, resolution: 'high' },
    { name: 'detección de papel', enhance: true, crop: true, rotate: 0, resolution: 'high' }
  ];
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const config = retryConfigs[attempt];
    console.log(`Intento ${attempt + 1}/${maxRetries} con configuración ${config.name} para ${filename}`);
    
    try {
      // Crear buffer de trabajo más pequeño si es necesario
      const bufferSizeMB = imageBuffer.length / (1024 * 1024);
      if (bufferSizeMB > 10) {
        console.log(`Redimensionando imagen ${filename} para procesamiento Mistral (${bufferSizeMB.toFixed(2)} MB)`);
        workingBuffer = await sharp(imageBuffer)
          .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
      } else {
        workingBuffer = Buffer.from(imageBuffer);
      }
      
      // Aplicar recorte de papel si es necesario (solo en último intento)
      let cropRegion = null;
      if (config.crop) {
        console.log(`Detectando área del papel para ${filename}...`);
        const cropResult = await detectAndCropPaper(workingBuffer);
        workingBuffer = cropResult.croppedImage;
        cropRegion = cropResult.cropRegion;
      }
      
      // Aplicar mejoras de imagen si es necesario
      if (config.enhance) {
        console.log(`Aplicando mejoras de imagen para ${filename}...`);
        processedImage = await sharp(workingBuffer)
          .greyscale()
          .normalize()
          .sharpen()
          .modulate({ contrast: 1.2 })
          .toBuffer();
        workingBuffer = processedImage;
        processedImage = null;
      }
      
      // Convertir a base64
      base64Image = workingBuffer.toString('base64');
      
      // Preparar prompt optimizado
      const prompt = config.resolution === 'high' 
        ? `Analiza esta imagen de checklist. Busca "Checklist N°", "Checklist Nº", "CHECKLIST N°" seguido de un número de 5-7 dígitos. Responde SOLO el número o "NO_ENCONTRADO".`
        : `Busca en esta imagen el texto "Checklist N°" seguido de un número de 5-7 dígitos. Responde SOLO el número o "NO_ENCONTRADO".`;
      
      // Llamar a Mistral con timeout reducido
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de Mistral')), 15000) // 15 segundos
      );
      
      const mistralPromise = mistral.chat.complete({
        model: 'pixtral-12b-2409',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: `data:image/jpeg;base64,${base64Image}`
              }
            ]
          }
        ],
        max_tokens: 30 // Reducido para respuestas más rápidas
      });
      
      const chatResponse = await Promise.race([mistralPromise, timeoutPromise]);
      
      const extractedText = chatResponse.choices[0]?.message?.content?.trim();
      console.log(`Respuesta de Mistral (intento ${attempt + 1}) para ${filename}: ${extractedText}`);
      
      if (extractedText && extractedText !== 'NO_ENCONTRADO') {
        const checklistNumber = extractChecklistNumber(extractedText);
        if (checklistNumber) {
          console.log(`Mistral extrajo número de checklist: ${checklistNumber} para ${filename} (intento ${attempt + 1})`);
          return {
            filename,
            checklistNumber,
            extractedText,
            confidence: 95 - (attempt * 15), // Reducir confianza con más intentos
            processingMethod: 'mistral_ocr',
            retryAttempt: attempt + 1,
            processingConfig: config.name,
            wasCropped: config.crop,
            rotation: config.rotate,
            cropRegion,
            success: true
          };
        }
      }
      
      console.log(`Intento ${attempt + 1} falló para ${filename}, probando con configuración diferente...`);
      
    } catch (error) {
      console.error(`Error en intento ${attempt + 1} para ${filename}:`, error.message);
      
      // Si es el último intento, devolver error
      if (attempt === maxRetries - 1) {
        return {
          filename,
          checklistNumber: null,
          error: `Error después de ${maxRetries} intentos: ${error.message}`,
          extractedText: '',
          wasCropped: false,
          cropRegion: null,
          success: false
        };
      }
    } finally {
      // Liberar memoria después de cada intento
      workingBuffer = null;
      processedImage = null;
      base64Image = null;
      
      if (global.gc) {
        global.gc();
      }
    }
    
    // Pausa más corta entre intentos
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Si todos los intentos fallan
  console.log(`Todos los intentos fallaron para ${filename}`);
  return {
    filename,
    checklistNumber: null,
    error: `No se pudo extraer número de checklist después de ${maxRetries} intentos con diferentes configuraciones.`,
    extractedText: '',
    wasCropped: false,
    cropRegion: null,
    success: false
  };
}

// Configurar Mistral
const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});