export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ProcessingResult {
  fileName: string;
  checklistNumber: string | null;
  extractedText?: string;
  confidence?: number;
  processingMethod?: string;
  wasCropped?: boolean;
  cropRegion?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  retryAttempt?: number;
  processingConfig?: string;
  rotation?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface BackendResponse {
  message: string;
  totalImages: number;
  successfulExtractions: number;
  failedExtractions: number;
  traditionalOcrSuccess: number;
  openaiSuccess: number;
  results: ProcessingResult[];
  checklistNumbers: {
    filename: string;
    checklistNumber: string;
    method: string;
    retryAttempt: number;
    processingConfig: string;
    wasCropped: boolean;
    rotation: number;
    confidence: number;
  }[];
}