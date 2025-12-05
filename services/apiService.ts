/**
 * Service này chịu trách nhiệm giao tiếp với Backend FastAPI của bạn.
 */

// --- CẤU HÌNH ---
// You can control mock vs real backend via Vite env var `VITE_USE_MOCK_DATA`.
// Create a `.env` file with `VITE_USE_MOCK_DATA=false` to call the real API.
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'false' ? false : (import.meta.env.VITE_USE_MOCK_DATA === 'true' ? true : true);

// URL Backend FastAPI của bạn (Ví dụ: chạy local ở port 8000)
const API_ENDPOINT = 'http://localhost:8000/predict'; 

export const analyzeImageWithBackend = async (base64Image: string): Promise<string> => {
  
  // 1. CHẾ ĐỘ GIẢ LẬP (MOCK)
  if (USE_MOCK_DATA) {
    console.warn("⚠️ Đang chạy chế độ Mock Data. Kết quả là ngẫu nhiên.");
    
    // Giả lập độ trễ mạng 1.5 giây
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Danh sách các bệnh giả định để test UI
    const mockConditions = [
      "Viêm da cơ địa (Atopic Dermatitis)",
      "Vảy nến (Psoriasis)",
      "Mụn trứng cá (Acne Vulgaris)",
      "Nấm da (Tinea Corporis)",
      "Viêm da tiếp xúc (Contact Dermatitis)",
      "Bớt sắc tố (Pigmented Nevus)",
      "Dày sừng ánh sáng (Actinic Keratosis)"
    ];
    
    // Trả về ngẫu nhiên 1 bệnh
    const randomCondition = mockConditions[Math.floor(Math.random() * mockConditions.length)];
    return randomCondition;
  }

  // 2. CHẾ ĐỘ GỌI API THẬT
  try {
    // Browser can fetch data URLs and convert them to Blob objects.
    // We send the image as multipart/form-data so FastAPI's UploadFile receives it as expected.
    const res = await fetch(base64Image);
    const blob = await res.blob();

    const formData = new FormData();
    // The FastAPI endpoint expects a field named 'file' (see API.py)
    formData.append('file', blob, 'upload.png');

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      // Do NOT set Content-Type header; the browser will set multipart/form-data boundary for us
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // API.py returns { disease: string, confidence: number }
    return data.disease || data.prediction || "Không xác định";

  } catch (error) {
    console.error("Lỗi khi gọi Backend:", error);
    throw error; // Let caller show an alert or handle UI
  }
};