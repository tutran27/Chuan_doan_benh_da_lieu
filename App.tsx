import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, ArrowRight, Activity, Stethoscope, MessageSquare, Download, MapPin, Map as MapIcon, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DiagnosticState, Question, Message } from './types';
import { analyzeImageWithBackend } from './services/apiService';
import { generateDiagnosticQuestions, generateMedicalAdvice, sendChatMessage, findNearbyClinics } from './services/geminiService';
import Button from './components/Button';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
  const [state, setState] = useState<DiagnosticState>({
    step: 'upload',
    image: null,
    backendPrediction: null,
    questions: [],
    finalDiagnosis: null, // This now stores the AI ADVICE
  });

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Clinic Finder State
  const [clinicsInfo, setClinicsInfo] = useState<string | null>(null);
  const [isFindingClinics, setIsFindingClinics] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 1: Handle Image Upload ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setState(prev => ({ ...prev, image: base64String }));
        startAnalysis(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async (image: string) => {
    setIsProcessing(true);
    setState(prev => ({ ...prev, step: 'analyzing' }));

    try {
      // 1. Call Mock Backend (FastAPI) -> This is the FINAL result source
      const prediction = await analyzeImageWithBackend(image);
      setState(prev => ({ ...prev, backendPrediction: prediction }));

      // 2. Call Gemini to generate questions to help CONSULT about that result
      const questionsData = await generateDiagnosticQuestions(image, prediction);
      
      const structuredQuestions: Question[] = questionsData.map((text, index) => ({
        id: index,
        text,
        answer: undefined
      }));

      setState(prev => ({ 
        ...prev, 
        step: 'questionnaire',
        questions: structuredQuestions,
        backendPrediction: prediction 
      }));

    } catch (error) {
      console.error("Analysis failed", error);
      alert("Có lỗi xảy ra trong quá trình phân tích. Vui lòng thử lại.");
      setState(prev => ({ ...prev, step: 'upload', image: null }));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Step 2: Handle Questionnaire ---
  const handleAnswer = (questionId: number, answer: 'yes' | 'no') => {
    setState(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === questionId ? { ...q, answer } : q)
    }));
  };

  const submitQuestionnaire = async () => {
    // Validate all answered
    if (state.questions.some(q => !q.answer)) {
      alert("Vui lòng trả lời tất cả câu hỏi");
      return;
    }

    setIsProcessing(true);
    setState(prev => ({ ...prev, step: 'diagnosing' }));

    try {
      if (!state.image || !state.backendPrediction) throw new Error("Missing data");

      // Generate Advice based on the fixed backend prediction + answers
      const advice = await generateMedicalAdvice(
        state.image, 
        state.backendPrediction, 
        state.questions
      );

      setState(prev => ({
        ...prev,
        step: 'result',
        finalDiagnosis: advice // Storing advice in the diagnosis field for display
      }));
    } catch (error) {
      console.error("Diagnosis failed", error);
      alert("Không thể tạo kết quả tư vấn.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Step 3: Handle Chat ---
  const handleSendMessage = async (text: string) => {
    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsProcessing(true);

    try {
      const responseText = await sendChatMessage(
        chatMessages, 
        text, 
        { 
          image: state.image, 
          diagnosis: state.backendPrediction // Chat context uses the real backend diagnosis
        }
      );

      const newBotMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };

      setChatMessages(prev => [...prev, newBotMsg]);
    } catch (error) {
      console.error("Chat error", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Features ---
  const handleDownloadResult = () => {
    if (!state.backendPrediction || !state.finalDiagnosis) return;
    const content = `KẾT QUẢ CHẨN ĐOÁN DA LIỄU\n\nChẩn đoán: ${state.backendPrediction}\n\nTư vấn chi tiết:\n${state.finalDiagnosis}`;
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "ket-qua-chan-doan-da-lieu.txt";
    document.body.appendChild(element); 
    element.click();
  };

  const handleFindClinics = () => {
    if (!navigator.geolocation) {
      alert("Trình duyệt của bạn không hỗ trợ định vị.");
      return;
    }

    setIsFindingClinics(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const result = await findNearbyClinics(latitude, longitude);
          setClinicsInfo(result);
        } catch (error) {
          console.error("Find clinics error", error);
          alert("Không thể tìm kiếm phòng khám lúc này.");
        } finally {
          setIsFindingClinics(false);
        }
      },
      (error) => {
        setIsFindingClinics(false);
        alert("Vui lòng cho phép truy cập vị trí để tìm phòng khám gần bạn.");
      }
    );
  };

  const resetApp = () => {
    setState({
      step: 'upload',
      image: null,
      backendPrediction: null,
      questions: [],
      finalDiagnosis: null,
    });
    setChatMessages([]);
    setClinicsInfo(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
            <div className="bg-teal-600 p-1.5 rounded-lg text-white">
              <Activity size={20} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-teal-700 to-teal-500 bg-clip-text text-transparent">DermaAI</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8">
        
        {/* Step 1: Upload */}
        {state.step === 'upload' && (
          <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
            <div className="text-center mb-8 max-w-lg">
              <h2 className="text-3xl font-bold text-slate-800 mb-3">Chẩn đoán Da liễu AI</h2>
              <p className="text-slate-600">Tải lên hình ảnh vùng da cần kiểm tra. Hệ thống sẽ phân tích và đưa ra kết quả ngay lập tức.</p>
            </div>
            
            <div 
              className="w-full max-w-md p-8 border-2 border-dashed border-teal-200 hover:border-teal-500 bg-teal-50/50 hover:bg-teal-50 rounded-2xl transition-all cursor-pointer flex flex-col items-center gap-4 group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-teal-600" />
              </div>
              <div className="text-center">
                <span className="text-teal-700 font-semibold block">Tải ảnh lên</span>
                <span className="text-slate-400 text-sm">JPG, PNG (Tối đa 5MB)</span>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>

            <div className="mt-8 flex items-start gap-3 p-4 bg-orange-50 text-orange-800 rounded-lg text-sm max-w-md border border-orange-100">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>Lưu ý: Kết quả từ AI chỉ mang tính chất tham khảo. Vui lòng luôn đi khám bác sĩ chuyên khoa để có kết luận chính xác.</p>
            </div>
          </div>
        )}

        {/* Step 2: Analyzing (Transition) */}
        {state.step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center h-[50vh]">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-teal-600 rounded-full border-t-transparent animate-spin"></div>
              <Stethoscope className="absolute inset-0 m-auto text-teal-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Đang phân tích hình ảnh...</h3>
            <p className="text-slate-500">Hệ thống đang quét các dấu hiệu lâm sàng</p>
          </div>
        )}

        {/* Step 3: Questionnaire */}
        {state.step === 'questionnaire' && state.image && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center gap-4 mb-6">
               <img src={state.image} alt="Uploaded" className="w-20 h-20 object-cover rounded-lg border border-slate-200 shadow-sm" />
               <div>
                 <h2 className="text-xl font-bold text-slate-800">Xác nhận triệu chứng</h2>
                 <p className="text-slate-600">Hệ thống đã có kết quả sơ bộ. Vui lòng trả lời thêm để nhận tư vấn chi tiết.</p>
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 space-y-6">
                {state.questions.map((q) => (
                  <div key={q.id} className="pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <p className="font-medium text-slate-800 mb-3 text-lg">{q.text}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAnswer(q.id, 'yes')}
                        className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                          q.answer === 'yes' 
                            ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-200' 
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {q.answer === 'yes' && <Check size={18} />}
                        Có
                      </button>
                      <button
                        onClick={() => handleAnswer(q.id, 'no')}
                        className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                          q.answer === 'no' 
                            ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-200' 
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {q.answer === 'no' && <Check size={18} />}
                        Không
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <Button onClick={submitQuestionnaire} className="w-full md:w-auto gap-2">
                  Xem kết quả & Tư vấn <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Diagnosing (Transition) */}
        {state.step === 'diagnosing' && (
          <div className="flex flex-col items-center justify-center h-[50vh]">
            <Activity className="w-16 h-16 text-teal-600 animate-bounce mb-6" />
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Đang tạo nội dung tư vấn...</h3>
            <p className="text-slate-500">Bác sĩ AI đang tổng hợp lời khuyên dựa trên kết quả phân tích</p>
          </div>
        )}

        {/* Step 5: Result & Chat */}
        {state.step === 'result' && state.backendPrediction && (
          <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* Left Column: Diagnosis Report */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-700 to-teal-600 p-4 text-white flex items-center justify-between">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <Stethoscope size={20} /> Kết quả & Tư vấn
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleDownloadResult}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
                      title="Tải kết quả"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  {/* Primary Diagnosis Result from Backend */}
                  <div className="bg-teal-50 border-l-4 border-teal-600 p-4 mb-6 rounded-r-lg">
                    <h3 className="text-sm font-semibold text-teal-800 uppercase tracking-wide mb-1">Kết quả phân tích hình ảnh</h3>
                    <p className="text-2xl font-bold text-teal-900">{state.backendPrediction}</p>
                  </div>

                  {/* AI Advice Section */}
                  <div className="prose prose-slate prose-headings:text-teal-900 prose-a:text-teal-600 max-w-none">
                     <h3 className="flex items-center gap-2 text-slate-800 border-b pb-2 mb-4">
                        <FileText className="w-5 h-5 text-teal-600" />
                        Tư vấn chi tiết từ Bác sĩ AI
                     </h3>
                     {/* Rendering Markdown safely */}
                     <ReactMarkdown>{state.finalDiagnosis || ''}</ReactMarkdown>
                  </div>
                </div>

                <div className="p-4 bg-orange-50 border-t border-orange-100">
                  <p className="text-xs text-orange-800 italic text-center">
                    *Kết quả phân tích hình ảnh được thực hiện bởi hệ thống máy học. Lời khuyên tư vấn được tạo bởi AI. Vui lòng tham khảo bác sĩ chuyên khoa.*
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button variant="outline" onClick={resetApp} className="gap-2">
                  <Upload size={16} /> Chẩn đoán ca khác
                </Button>
                <Button 
                   variant="secondary" 
                   onClick={handleFindClinics} 
                   className="gap-2"
                   isLoading={isFindingClinics}
                >
                  <MapPin size={16} /> Tìm phòng khám gần đây
                </Button>
              </div>

              {/* Clinic Finder Results */}
              {clinicsInfo && (
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                      <MapIcon size={20} className="text-teal-600" />
                      Phòng khám đề xuất
                    </h3>
                    <div className="prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown>{clinicsInfo}</ReactMarkdown>
                    </div>
                 </div>
              )}
            </div>

            {/* Right Column: Chatbot */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
                <MessageSquare className="w-5 h-5 flex-shrink-0" />
                <p>Bạn còn thắc mắc về <b>{state.backendPrediction}</b>? Hãy trò chuyện với Trợ lý ảo ngay bên dưới.</p>
              </div>
              <ChatInterface 
                messages={chatMessages} 
                onSendMessage={handleSendMessage} 
                isLoading={isProcessing} 
              />
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-400 text-sm font-medium">
        Powered by HARU Team
      </footer>
    </div>
  );
};

export default App;