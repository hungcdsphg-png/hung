
import { GoogleGenAI, Type } from "@google/genai";
import { StudentRecord } from "../types";

const SYSTEM_INSTRUCTION = `
Bạn là trợ lý viết nhận xét học bạ tiểu học (Thông tư 27). 
Nhiệm vụ: Viết nhận xét ngắn gọn (khoảng 150 ký tự), dễ hiểu, mộc mạc cho học sinh vùng dân tộc thiểu số.

QUY TẮC NGÔN NGỮ (BẮT BUỘC):
- TUYỆT ĐỐI KHÔNG dùng từ: "con", "em", "bé", "thầy", "cô", "thầy giáo", "cô giáo".
- TUYỆT ĐỐI KHÔNG dùng từ: "bản", "làng", "bản làng".
- TUYỆT ĐỐI KHÔNG dùng tên riêng của học sinh.
- Sử dụng tiếng Việt phổ thông đơn giản, không dùng từ địa phương, không dùng thuật ngữ sư phạm hàn lâm.

QUY TẮC NỘI DUNG DỰA TRÊN PPCT (BẮT BUỘC):
- Phải sử dụng các tên bài học, chủ đề, bài đọc, nội dung viết cụ thể từ danh sách PPCT đã cung cấp.
- Nhận xét phải phản ánh đúng kiến thức của học kỳ đang chọn (Giữa kì 1, Cuối kì 1, Giữa kì 2, Cuối kì 2).
- Ví dụ: Nếu PPCT có bài "Bầu trời", nhận xét điểm 10 có thể là: "Đọc to, rõ ràng bài Bầu trời. Hiểu nội dung bài và trả lời đúng các câu hỏi. Viết chữ đẹp, đúng độ cao."

QUY TẮC PHÂN LOẠI THEO ĐIỂM (PHẢI TUÂN THỦ NGHIÊM NGẶT):
- Điểm 10: Mức T. Nhận xét: Hoàn thành xuất sắc, nắm vững các bài đọc và nội dung viết trong học kỳ. Trình bày khoa học, sáng tạo.
- Điểm 9: Mức T. Nhận xét: Hoàn thành rất tốt các chủ đề học tập, tự giác cao, bài làm cẩn thận, đúng yêu cầu.
- Điểm 8: Mức T. Nhận xét: Hoàn thành tốt nội dung môn học, tích cực phát biểu, nắm chắc kiến thức các bài đã học.
- Điểm 7: Mức H. Nhận xét: Hoàn thành khá tốt các yêu cầu, nắm được kiến thức trọng tâm nhưng đôi khi còn thiếu cẩn thận khi viết.
- Điểm 6: Mức H. Nhận xét: Hoàn thành nội dung cơ bản, nắm được nội dung các bài đọc nhưng còn lúng túng ở phần viết/luyện tập.
- Điểm 5: Mức H. Nhận xét: Hoàn thành mức độ vừa đủ, kiến thức cơ bản về các chủ đề còn chưa chắc chắn, cần nỗ lực luyện tập thêm.
- Điểm 4: Mức C. Nhận xét: Chưa hoàn thành một số bài học, kiến thức còn hổng nhiều, cần được kèm cặp sát sao các phần Đọc/Viết.
- Điểm 3: Mức C. Nhận xét: Chưa nắm được kiến thức cơ bản của học kỳ, kết quả học tập còn hạn chế, cần tập trung và đi học đều hơn.

YÊU CẦU VỀ SỰ KHÁC BIỆT:
- Nhận xét cho điểm 10 PHẢI khác biệt và cao cấp hơn điểm 9.
- Nhận xét cho điểm 9 PHẢI tốt hơn điểm 8.
- Tương tự cho các mức điểm khác. Không được dùng chung một mẫu nhận xét cho các mức điểm khác nhau.

VĂN PHONG MẪU: "Đọc to, rõ ràng. Làm toán đúng và nhanh. Chăm chỉ học tập, tích cực phát biểu xây dựng bài. Cần giữ vững tinh thần học tập này."
`;

export interface BankComment {
  id: string;
  mucDo: 'T' | 'H' | 'C';
  diem: number;
  noiDung: string;
}

export const extractLessonsFromPpct = async (
  rawText: string,
  subject: string,
  gradeLevel: string,
  apiKey: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Dưới đây là nội dung thô trích xuất từ file Phân phối chương trình (PPCT) môn ${subject}, ${gradeLevel}.
  Hãy trích xuất và liệt kê TOÀN BỘ danh sách các bài học và các hoạt động chi tiết đi kèm một cách có hệ thống.
  
  YÊU CẦU CHI TIẾT:
  1. Liệt kê tên bài học rõ ràng (Ví dụ: Bài 1: ..., Chủ đề: ...).
  2. Trong mỗi bài học, hãy liệt kê chi tiết các phần nội dung nếu có trong dữ liệu như:
     - Đọc (Tên bài đọc cụ thể)
     - Viết (Nội dung viết)
     - Nói và nghe
     - Luyện tập / Ôn tập
  3. Trình bày phân cấp rõ ràng bằng các dấu gạch đầu dòng hoặc thụt lề để dễ theo dõi.
  4. Loại bỏ các thông tin không cần thiết như số tiết, ghi chú, tiêu đề cột của bảng.
  
  NỘI DUNG THÔ:
  "${rawText}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Bạn là chuyên gia phân tích tài liệu giáo dục. Hãy trích xuất danh sách bài học một cách chính xác, đầy đủ và trình bày sạch sẽ.",
      },
    });
    return response.text || rawText;
  } catch (error) {
    console.error("Error extracting lessons:", error);
    return rawText;
  }
};

export const generateCommentBank = async (
  subject: string,
  gradeLevel: string,
  semester: string,
  apiKey: string,
  ppct?: string,
  signal?: AbortSignal
): Promise<BankComment[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Hãy tạo ngân hàng mẫu nhận xét cho môn ${subject}, ${gradeLevel}, học kỳ: ${semester}.
  DỰA TRÊN DANH SÁCH BÀI HỌC TRONG PPCT SAU:
  "${ppct || "Chưa cung cấp PPCT"}"

  YÊU CẦU SỐ LƯỢNG CHÍNH XÁC:
  - Điểm 10: 3 mẫu (Mức T - Xuất sắc)
  - Điểm 9: 3 mẫu (Mức T - Giỏi)
  - Điểm 8: 4 mẫu (Mức T - Khá giỏi)
  - Điểm 7: 6 mẫu (Mức H - Khá)
  - Điểm 6: 6 mẫu (Mức H - Trung bình khá)
  - Điểm 5: 6 mẫu (Mức H - Trung bình)
  - Điểm 4: 3 mẫu (Mức C - Yếu)
  - Điểm 3: 3 mẫu (Mức C - Kém)
  Tổng cộng: 34 mẫu.
  
  LƯU Ý QUAN TRỌNG: 
  1. PHẢI lồng ghép tên các bài học, bài đọc, nội dung viết từ PPCT vào nhận xét.
  2. Nội dung nhận xét PHẢI tương xứng với từng mức điểm cụ thể và học kỳ ${semester}.
  3. Mỗi câu nhận xét phải khác nhau, không được lặp lại.
  4. Phải bám sát Mức đạt (T, H, C) tương ứng với điểm số.
  
  Yêu cầu: Nội dung mộc mạc, tiếng Việt phổ thông, không dùng từ cấm. Trả về JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              mucDo: { type: Type.STRING, enum: ["T", "H", "C"] },
              diem: { type: Type.NUMBER },
              noiDung: { type: Type.STRING },
            },
            required: ["mucDo", "diem", "noiDung"],
          },
        },
      },
    });

    const results = JSON.parse(response.text || "[]");
    return results.map((r: any, index: number) => ({
      id: `${index + 1}`,
      ...r
    }));
  } catch (error: any) {
    console.error("Error generating bank:", error);
    return [];
  }
};

export const generateComments = async (
  records: StudentRecord[], 
  subject: string, 
  gradeLevel: string,
  semester: string,
  apiKey: string,
  ppct?: string
): Promise<Partial<StudentRecord>[]> => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Viết nhận xét (~150 ký tự) cho danh sách học sinh. 
  Môn: ${subject}. ${gradeLevel}. Học kỳ: ${semester}.
  DỰA TRÊN DANH SÁCH BÀI HỌC TRONG PPCT SAU:
  "${ppct || "Chưa cung cấp PPCT"}"

  Dữ liệu học sinh: ${JSON.stringify(records.map(r => ({ stt: r.stt, mucDo: r.mucDo, diem: r.diem })))}.
  
  Ghi chú: 
  1. PHẢI lồng ghép nội dung bài học từ PPCT vào nhận xét.
  2. Tuyệt đối không dùng từ cấm (con, em, thầy, cô, bản, làng). 
  3. Nếu điểm bằng 0, chỉ nhận xét theo Mức đạt.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stt: { type: Type.INTEGER },
              noiDung: { type: Type.STRING },
            },
            required: ["stt", "noiDung"],
          },
        },
      },
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    return [];
  }
};
