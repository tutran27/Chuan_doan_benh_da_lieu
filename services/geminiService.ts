import { GoogleGenAI, Type } from "@google/genai";
import { Message, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

// System instruction for the dermatologist persona
const SYSTEM_INSTRUCTION = `
Bạn là một trợ lý bác sĩ da liễu chuyên nghiệp, tận tâm và thông minh.
Nhiệm vụ của bạn là hỗ trợ tư vấn và đưa ra lời khuyên dựa trên kết quả chẩn đoán đã có.
Bạn KHÔNG được phép thay đổi kết quả chẩn đoán của hệ thống.
Ngôn ngữ sử dụng: Tiếng Việt.
`;

/**
 * Generates Yes/No questions based on the image and the backend's preliminary prediction.
 */
export const generateDiagnosticQuestions = async (
  base64Image: string,
  backendPrediction: string
): Promise<string[]> => {
  try {
    const prompt = `
      Tôi có một bệnh nhân.
      Hệ thống chẩn đoán hình ảnh đã xác định bệnh nhân mắc: "${backendPrediction}".
      
      Hãy đóng vai bác sĩ, dựa trên bệnh lý này và quan sát thêm hình ảnh.
      Hãy đưa ra 3 đến 4 câu hỏi quan trọng dạng Yes/No (Có/Không) để khai thác thêm triệu chứng lâm sàng (như cảm giác ngứa, đau, thời gian mắc bệnh...).
      Mục đích là để có thêm thông tin nhằm đưa ra lời khuyên chăm sóc chính xác nhất ở bước sau.
      
      Chỉ trả về danh sách câu hỏi.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] } },
          { text: prompt }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const rawText = response.text || "[]";
    const cleanText = rawText.replace(/```json\n?|```/g, '').trim();
    const questions = JSON.parse(cleanText);
    
    return Array.isArray(questions) ? questions : [];
  } catch (error) {
    console.error("Error generating questions:", error);
    return [
      "Bạn có cảm thấy ngứa ở vùng da này không?",
      "Vết thương này đã xuất hiện lâu chưa (trên 2 tuần)?",
      "Bạn có bị sốt nhẹ không?"
    ];
  }
};

/**
 * Generates medical advice based on the FIXED backend diagnosis and user answers.
 */
export const generateMedicalAdvice = async (
  base64Image: string,
  backendPrediction: string,
  qaHistory: Question[]
): Promise<string> => {
  const qaText = qaHistory.map(q => `- Hỏi: ${q.text}\n  - Trả lời: ${q.answer === 'yes' ? 'Có' : 'Không'}`).join('\n');

  const prompt = `
    Thông tin ca bệnh:
    1. Kết quả chẩn đoán xác định từ hệ thống: "${backendPrediction}".
    2. Triệu chứng bệnh nhân cung cấp thêm:
    ${qaText}

    Nhiệm vụ:
    Dựa trên bệnh "${backendPrediction}" và các triệu chứng trên, hãy đưa ra lời khuyên tư vấn chi tiết.
    
    Cấu trúc câu trả lời:
    - **Nhận định tình trạng**: Tóm tắt ngắn gọn tình trạng dựa trên câu trả lời (ví dụ: mức độ nghiêm trọng dựa trên triệu chứng).
    - **Lời khuyên điều trị & Chăm sóc**: Các phương pháp hỗ trợ điều trị, vệ sinh, chế độ ăn uống phù hợp với bệnh ${backendPrediction}.
    - **Cảnh báo**: Những dấu hiệu nào cho thấy bệnh đang trở nặng cần đi viện ngay lập tức.
    
    Lưu ý: Không chẩn đoán lại tên bệnh. Hãy tập trung vào tư vấn giải pháp.
    Định dạng Markdown.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  });

  return response.text || "Xin lỗi, tôi không thể đưa ra lời khuyên lúc này.";
};

/**
 * Handles general chat about the condition.
 */
export const sendChatMessage = async (
  history: Message[],
  newMessage: string,
  contextData: { image: string | null; diagnosis: string | null }
): Promise<string> => {
  
  let chatContents = [];
  
  if (contextData.image && contextData.diagnosis) {
     const contextPrompt = `
       Bối cảnh: Bệnh nhân đã có kết quả chẩn đoán là: ${contextData.diagnosis}.
       Bây giờ họ đang hỏi thêm. Hãy trả lời ngắn gọn, súc tích xoay quanh bệnh này.
     `;
     chatContents.push({
        role: 'user',
        parts: [
             { inlineData: { mimeType: 'image/jpeg', data: contextData.image.split(',')[1] } },
             { text: contextPrompt }
        ]
     });
     chatContents.push({
         role: 'model',
         parts: [{ text: "Tôi đã hiểu. Bạn cần tư vấn thêm gì về bệnh này?" }]
     });
  }

  history.forEach(msg => {
      chatContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
      });
  });

  chatContents.push({
      role: 'user',
      parts: [{ text: newMessage }]
  });

  const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: chatContents,
      config: {
          systemInstruction: SYSTEM_INSTRUCTION
      }
  });

  return response.text || "Tôi không nghe rõ, bạn nói lại được không?";
};

/**
 * Finds nearby clinics using Google Maps Grounding.
 */
export const findNearbyClinics = async (lat: number, lng: number): Promise<string> => {
  const prompt = "Hãy tìm 3 phòng khám da liễu hoặc bệnh viện có chuyên khoa da liễu uy tín gần vị trí này nhất. Hiển thị dưới dạng danh sách markdown kèm địa chỉ.";
  
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    }
  });

  return response.text || "Không tìm thấy phòng khám nào gần đây.";
};