import io
import os
import torch
import torch.nn as nn
# Timm rất cần thiết để tạo lại kiến trúc model
import timm 
from torchvision import transforms
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# --- CẤU HÌNH ỨNG DỤNG ---
app = FastAPI(
    title="SkinAI Prediction API",
    description="API để chẩn đoán bệnh da liễu từ hình ảnh sử dụng mô hình PyTorch.",
    version="1.3.0"
)

# Cho phép frontend gọi API
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ĐỊNH NGHĨA KIẾN TRÚC MODEL ---
# <--- THAY ĐỔI 1: Thêm hàm tạo kiến trúc model --->
def create_model(num_classes: int):
    """
    Tạo lại kiến trúc model đã được sử dụng để huấn luyện.
    
    QUAN TRỌNG: Bạn PHẢI thay đổi 'efficientnet_b0' thành đúng tên model
    mà bạn đã dùng (ví dụ: 'resnet50', 'vit_base_patch16_224', v.v.).
    """
    # Sử dụng timm để tạo model. `pretrained=False` vì chúng ta sẽ tải trọng số của riêng mình.
    model = timm.create_model('tf_efficientnetv2_s.in21k_ft_in1k', pretrained=False, num_classes=num_classes)
    return model

# --- TẢI MODEL VÀ CÀI ĐẶT ---
MODEL_WEIGHTS_PATH = "weight.pth"  # Đổi tên biến để rõ ràng hơn
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
model = None 

CLASS_NAMES = [
    'Mề đay', 'Nấm da', 'Ghẻ, nhiễm trùng', 'Zona', 'Vảy nến',
    'HPV, bệnh lây qua đường tình dục', 'Lupus, các bệnh mô'
]

# <--- THAY ĐỔI 2: Cập nhật logic tải model --->
print("--- Bắt đầu quá trình tải Model từ Trọng số (State Dict) ---")
try:
    if not os.path.exists(MODEL_WEIGHTS_PATH):
        raise FileNotFoundError(f"Không tìm thấy tệp trọng số tại đường dẫn: '{MODEL_WEIGHTS_PATH}'.")

    # Bước 1: Khởi tạo kiến trúc model rỗng
    print(f"Bước 1: Khởi tạo kiến trúc model với {len(CLASS_NAMES)} lớp đầu ra...")
    model = create_model(num_classes=len(CLASS_NAMES))

    # Bước 2: Tải các trọng số (state_dict) từ file .pth
    print(f"Bước 2: Đang tải trọng số từ '{MODEL_WEIGHTS_PATH}'...")
    # Tải trọng số vào CPU trước để tránh lỗi nếu file được lưu trên GPU
    state_dict = torch.load(MODEL_WEIGHTS_PATH, map_location=torch.device('cpu')) 
    
    # Bước 3: Nạp trọng số vào kiến trúc model
    model.load_state_dict(state_dict)

    # Bước 4: Chuyển model sang thiết bị và chế độ đánh giá
    model.to(DEVICE)
    model.eval()
    print(f"Model đã được tải và cấu hình thành công lên thiết bị '{DEVICE}'. API đã sẵn sàng.")

except FileNotFoundError as e:
    print(f"LỖI NGHIÊM TRỌNG: {e}")
except Exception as e:
    print(f"LỖI NGHIÊM TRỌNG: Đã có lỗi không xác định xảy ra khi tải model: {e}")
    print("GỢI Ý: Hãy đảm bảo tên model trong hàm `create_model` khớp với tệp trọng số.")
    print("API sẽ không hoạt động cho đến khi lỗi này được khắc phục.")


# --- XỬ LÝ HÌNH ẢNH (Không đổi) ---
image_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def transform_image(image_bytes: bytes) -> torch.Tensor:
    """Chuyển đổi bytes của ảnh thành tensor có thể đưa vào model."""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return image_transform(image).unsqueeze(0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Tệp ảnh không hợp lệ: {e}")

# --- ĐỊNH NGHĨA ENDPOINT API (Không đổi) ---
@app.get("/", tags=["General"])
def read_root():
    """Endpoint mặc định để kiểm tra API có hoạt động không."""
    return {"message": "Chào mừng đến với SkinAI Prediction API!"}

@app.post("/predict", tags=["Prediction"])
async def predict(file: UploadFile = File(...)):
    """
    Nhận một tệp ảnh, chẩn đoán và trả về bệnh cùng độ tin cậy.
    """
    if not model:
        raise HTTPException(status_code=500, detail="Model AI chưa được tải hoặc tải thất bại. Vui lòng kiểm tra log của server.")

    image_bytes = await file.read()
    tensor = transform_image(image_bytes)
    tensor = tensor.to(DEVICE)

    with torch.no_grad():
        outputs = model(tensor)
        probabilities = torch.nn.functional.softmax(outputs, dim=1)
        confidence, predicted_idx = torch.max(probabilities, 1)

    predicted_class = CLASS_NAMES[predicted_idx.item()]
    confidence_score = confidence.item()

    print(f"Kết quả dự đoán cho ảnh '{file.filename}': {predicted_class} với độ tin cậy {confidence_score:.4f}")

    return {
        "disease": predicted_class,
        "confidence": confidence_score
    }

# --- CHẠY SERVER ---
if __name__ == "__main__":
    # Lưu file này với tên main.py và chạy lệnh: uvicorn main:app --reload
    uvicorn.run(app, host="127.0.0.1", port=8000)