export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
}

export interface Question {
  id: number;
  text: string;
  answer?: 'yes' | 'no';
}

export interface DiagnosticState {
  step: 'upload' | 'analyzing' | 'questionnaire' | 'diagnosing' | 'result' | 'chat';
  image: string | null; // Base64
  backendPrediction: string | null;
  questions: Question[];
  finalDiagnosis: string | null;
}

export enum BackendStatus {
  IDLE,
  LOADING,
  SUCCESS,
  ERROR
}