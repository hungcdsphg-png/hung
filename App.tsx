
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StudentRecord, MON_HOC_TIEU_HOC, KHOI_LOP, getSubjectAbbr } from './types';
import { generateComments, generateCommentBank, BankComment, extractLessonsFromPpct } from './services/geminiService';
import { 
  Plus, 
  Sparkles, 
  Download, 
  Upload,
  BookOpen,
  CheckCircle2, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Table as TableIcon,
  AlignLeft,
  Search,
  FileJson,
  Database,
  Trash2,
  FileSpreadsheet,
  Square,
  FileUp,
  FileDown,
  CalendarDays,
  Mountain,
  Settings,
  Key,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Cấu hình worker cho PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type ViewMode = 'table' | 'content';
const HOC_KY = ["Giữa kì 1", "Cuối kì 1", "Giữa kì 2", "Cuối kì 2"];

const App: React.FC = () => {
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [commentBank, setCommentBank] = useState<BankComment[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(MON_HOC_TIEU_HOC[0]);
  const [selectedGrade, setSelectedGrade] = useState(KHOI_LOP[0]);
  const [selectedSemester, setSelectedSemester] = useState(HOC_KY[0]);
  const [ppct, setPpct] = useState('');
  const [showPpctInput, setShowPpctInput] = useState(false);
  const [isExtractingPpct, setIsExtractingPpct] = useState(false);
  const [isGeneratingBank, setIsGeneratingBank] = useState(false);
  const [viewMode, setViewMode] = useState('table' as ViewMode);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ppctFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const calculatedRecords = useMemo(() => {
    const abbr = getSubjectAbbr(selectedSubject);
    const counters: Record<string, number> = {};
    
    return records.map(record => {
      const studentScore = record.diem > 0 ? Math.round(record.diem) : 0;
      let level = record.mucDo;
      
      // Quy tắc phân loại mức độ theo điểm mới (10,9,8=T | 7,6,5=H | 4,3=C)
      if (studentScore > 0) {
        if (studentScore >= 8) level = 'T';
        else if (studentScore >= 5) level = 'H';
        else level = 'C';
      }
      
      level = level || 'H';
      
      const counterKey = `${studentScore}_${level}`;
      counters[counterKey] = (counters[counterKey] || 0) + 1;
      
      const scoreStr = studentScore > 0 ? studentScore.toString() : "";
      const semesterAbbr = selectedSemester === "Giữa kì 1" ? "GK1" : 
                          selectedSemester === "Cuối kì 1" ? "CK1" :
                          selectedSemester === "Giữa kì 2" ? "GK2" : "CK2";
      const generatedCode = `${abbr}${scoreStr}${semesterAbbr}${level}${counters[counterKey]}`;
      const code = record.maNhanXet || generatedCode;
      
      let targetGroup: BankComment[] = [];
      if (studentScore > 0) {
        targetGroup = commentBank.filter(b => b.diem === studentScore);
        if (targetGroup.length === 0) targetGroup = commentBank.filter(b => b.mucDo === level);
      } else {
        targetGroup = commentBank.filter(b => b.mucDo === level);
      }
      
      let autoContent = record.noiDung;
      if (targetGroup.length > 0 && !record.noiDung) {
        const bankIndex = (counters[counterKey] - 1) % targetGroup.length;
        autoContent = targetGroup[bankIndex].noiDung;
      }

      return { ...record, mucDo: level, maNhanXet: code, noiDung: autoContent };
    });
  }, [records, selectedSubject, commentBank, selectedSemester]);

  const filteredRecords = useMemo(() => {
    if (!searchTerm) return calculatedRecords;
    return calculatedRecords.filter(r => 
      r.hoTen.toLowerCase().includes(searchTerm.toLowerCase()) || 
      r.maNhanXet.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [calculatedRecords, searchTerm]);

  const handleGenerateBank = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true);
      setNotification({ type: 'error', message: 'Vui lòng nhập API Key của Google AI Studio để sử dụng tính năng này.' });
      return;
    }
    setIsGeneratingBank(true);
    setNotification(null);
    abortControllerRef.current = new AbortController();
    
    try {
      const bank = await generateCommentBank(
        selectedSubject, 
        selectedGrade, 
        selectedSemester, 
        apiKey,
        ppct,
        abortControllerRef.current.signal
      );
      if (bank.length > 0) {
        setCommentBank(bank);
        setNotification({ type: 'success', message: `Đã tạo xong ngân hàng 34 mẫu nhận xét cho môn ${selectedSubject}.` });
      }
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Lỗi AI khi tạo nội dung.' });
    } finally {
      setIsGeneratingBank(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGenerating = () => abortControllerRef.current?.abort();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        
        const subjectName = selectedSubject.toLowerCase();
        const subjectAbbr = getSubjectAbbr(selectedSubject).toLowerCase();
        
        const targetSheetName = wb.SheetNames.find(name => {
          const n = name.toLowerCase();
          return n.includes(subjectName) || n === subjectAbbr || n.includes(subjectAbbr);
        }) || wb.SheetNames[0];

        const ws = wb.Sheets[targetSheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        
        // Từ khóa mở rộng để tìm tiêu đề chính xác
        const sttKeywords = ['stt', 'số thứ tự'];
        const nameKeywords = ['họ tên', 'họ và tên', 'tên học sinh', 'học sinh'];
        const dobKeywords = ['ngày sinh', 'năm sinh', 'ns'];
        const levelKeywords = ['mức đạt được', 'mức đạt', 'xếp loại', 'đánh giá'];
        const scoreKeywords = ['điểm ktdk', 'điểm ktđk', 'ktdk', 'điểm kiểm tra', 'điểm cuối kỳ'];
        
        let sttIdx = -1, nameIdx = -1, dobIdx = -1, levelIdx = -1, scoreIdx = -1;
        let headerRowIdx = -1;

        for (let i = 0; i < Math.min(data.length, 20); i++) {
          const row = (data[i] || []).map(c => String(c).toLowerCase().trim());
          const foundName = row.findIndex(c => nameKeywords.some(k => c.includes(k)));
          
          if (foundName !== -1) {
            nameIdx = foundName;
            sttIdx = row.findIndex(c => sttKeywords.some(k => c === k || c.startsWith(k)));
            dobIdx = row.findIndex(c => dobKeywords.some(k => c.includes(k)));
            levelIdx = row.findIndex(c => levelKeywords.some(k => c.includes(k)));
            scoreIdx = row.findIndex(c => scoreKeywords.some(k => c.includes(k)));
            headerRowIdx = i;
            break;
          }
        }

        if (nameIdx === -1) {
          setNotification({ type: 'error', message: `Không tìm thấy cột Họ Tên trong sheet "${targetSheetName}".` });
          return;
        }

        const formatDate = (val: any): string => {
          if (!val) return "";
          if (val instanceof Date) return val.toLocaleDateString('vi-VN');
          return String(val).trim();
        };

        const newRecords = data.slice(headerRowIdx + 1)
          .filter(r => String(r[nameIdx] || "").trim().length > 1)
          .map((r, idx) => {
            let rawLevel = levelIdx !== -1 ? String(r[levelIdx] || "").trim().toUpperCase() : "";
            let level = "";
            if (rawLevel.includes("TỐT") || rawLevel === "T" || rawLevel.includes("HTT")) level = "T";
            else if (rawLevel.includes("CHƯA") || rawLevel === "C" || rawLevel.includes("CHT")) level = "C";
            else if (rawLevel.includes("HOÀN THÀNH") || rawLevel === "H" || rawLevel === "HT") level = "H";
            
            let diem = 0;
            if (scoreIdx !== -1) {
              const val = r[scoreIdx];
              if (val !== undefined && val !== "" && val !== null) {
                diem = parseFloat(String(val).replace(',', '.')) || 0;
              }
            }

            return {
              stt: sttIdx !== -1 ? (parseInt(String(r[sttIdx])) || idx + 1) : idx + 1,
              hoTen: String(r[nameIdx] || "").trim(),
              ngaySinh: dobIdx !== -1 ? formatDate(r[dobIdx]) : "",
              diem: diem,
              mucDo: level,
              maNhanXet: "",
              noiDung: "",
              isProcessing: false
            } as StudentRecord;
          });

        setRecords(newRecords);
        setNotification({ 
          type: 'success', 
          message: `Đã nhập chính xác ${newRecords.length} học sinh từ sheet "${targetSheetName}".` 
        });

      } catch (err) { 
        setNotification({ type: 'error', message: 'Lỗi định dạng file Excel. Hãy kiểm tra các tiêu đề cột.' }); 
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePpctFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();
    
    setNotification({ type: 'info', message: `Đang phân tích file ${file.name}...` });
    setIsExtractingPpct(true);

    const processText = async (text: string) => {
      if (!apiKey) {
        setShowApiKeyModal(true);
        setNotification({ type: 'error', message: 'Vui lòng nhập API Key để AI trích xuất bài học.' });
        setIsExtractingPpct(false);
        return;
      }
      try {
        const cleanLessons = await extractLessonsFromPpct(text, selectedSubject, selectedGrade, apiKey);
        setPpct(cleanLessons);
        setNotification({ 
          type: 'success', 
          message: `Đã trích xuất danh sách bài học từ file: ${file.name}.` 
        });
      } catch (err) {
        setPpct(text);
        setNotification({ type: 'error', message: 'Lỗi AI khi trích xuất bài học, đang hiển thị nội dung thô.' });
      } finally {
        setIsExtractingPpct(false);
      }
    };

    try {
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.onload = async (evt) => {
          try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            
            const content = data
              .map(row => row.filter(cell => cell !== null && cell !== "").join(" "))
              .filter(text => text.length > 5)
              .join("\n");
              
            await processText(content);
          } catch (err) {
            setNotification({ type: 'error', message: 'Lỗi khi đọc file Excel PPCT.' });
            setIsExtractingPpct(false);
          }
        };
        reader.readAsBinaryString(file);
      } 
      else if (fileName.endsWith('.docx')) {
        reader.onload = async (evt) => {
          try {
            const arrayBuffer = evt.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            await processText(result.value);
          } catch (err) {
            setNotification({ type: 'error', message: 'Lỗi khi đọc file Word PPCT.' });
            setIsExtractingPpct(false);
          }
        };
        reader.readAsArrayBuffer(file);
      }
      else if (fileName.endsWith('.pdf')) {
        reader.onload = async (evt) => {
          try {
            const arrayBuffer = evt.target?.result as ArrayBuffer;
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            let fullText = "";
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");
              fullText += pageText + "\n";
            }
            
            await processText(fullText);
          } catch (err) {
            setNotification({ type: 'error', message: 'Lỗi khi đọc file PDF PPCT.' });
            setIsExtractingPpct(false);
          }
        };
        reader.readAsArrayBuffer(file);
      }
      else {
        setNotification({ type: 'error', message: 'Định dạng file không hỗ trợ. Vui lòng chọn Excel, Word hoặc PDF.' });
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Có lỗi xảy ra khi xử lý file.' });
    }

    if (ppctFileInputRef.current) ppctFileInputRef.current.value = '';
  };

  const exportTableToExcel = () => {
    const data = filteredRecords.map(r => [
      r.stt, 
      r.hoTen, 
      r.ngaySinh,
      r.mucDo === 'T' ? 'HTT' : r.mucDo === 'H' ? 'HT' : 'CHT', 
      r.diem > 0 ? r.diem : "", 
      r.maNhanXet, 
      r.noiDung
    ]);
    const ws = XLSX.utils.aoa_to_sheet([["STT", "Họ tên", "Ngày sinh", "Mức đạt được", "Điểm KTĐK", "Mã NX", "Nội dung nhận xét"], ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NhanXet");
    XLSX.writeFile(wb, `NhanXet_${selectedGrade}_${selectedSubject}.xlsx`);
  };

  const exportBankToExcel = () => {
    if (commentBank.length === 0) {
      setNotification({ type: 'error', message: 'Chưa có ngân hàng mẫu để xuất file.' });
      return;
    }
    const abbr = getSubjectAbbr(selectedSubject);
    const semesterAbbr = selectedSemester === "Giữa kì 1" ? "GK1" : 
                        selectedSemester === "Cuối kì 1" ? "CK1" :
                        selectedSemester === "Giữa kì 2" ? "GK2" : "CK2";
    const data = commentBank.map((item, index) => {
      const sameGroup = commentBank.slice(0, index + 1).filter(b => b.diem === item.diem && b.mucDo === item.mucDo);
      const displayCode = `${abbr}${item.diem || ""}${semesterAbbr}${item.mucDo}${sameGroup.length}`;
      
      return {
        "STT": index + 1,
        "Mã nhận xét": displayCode,
        "Mức đạt": item.mucDo === 'T' ? 'HTT' : item.mucDo === 'H' ? 'HT' : 'CHT',
        "Điểm số": item.diem || "",
        "Nội dung nhận xét phổ thông": item.noiDung
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NganHangMau");
    const wscols = [{wch: 5}, {wch: 15}, {wch: 12}, {wch: 10}, {wch: 95}];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `NganHang_${selectedGrade}_${selectedSubject}.xlsx`);
    setNotification({ type: 'success', message: 'Đã xuất file ngân hàng mẫu 34 nội dung.' });
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('gemini_api_key', tempApiKey);
    setApiKey(tempApiKey);
    setShowApiKeyModal(false);
    setNotification({ type: 'success', message: 'Đã lưu API Key thành công!' });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20 text-slate-900">
      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                    <Key size={20} />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Cấu hình API Key</h3>
                </div>
                <button onClick={() => setShowApiKeyModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
                Nhập API Key từ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">Google AI Studio</a> để sử dụng các tính năng thông minh của trợ lý.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Google Gemini API Key</label>
                  <input 
                    type="password" 
                    placeholder="Dán API Key của bạn vào đây..." 
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 transition-all font-mono"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowApiKeyModal(false)}
                    className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={handleSaveApiKey}
                    className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold text-center uppercase tracking-tighter">
                API Key được lưu an toàn trong trình duyệt của bạn
              </p>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg relative">
              <BookOpen size={24} />
              <Mountain size={14} className="absolute -bottom-1 -right-1 text-white opacity-40" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">TRỢ LÍ TẠO NHẬN XÉT  ({selectedGrade})</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-tight">Môn: {selectedSubject} | Hỗ trợ giáo viên </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-slate-100 p-1 rounded-xl items-center border border-slate-200">
              <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="px-3 py-1.5 bg-transparent text-sm font-bold outline-none border-r border-slate-200 cursor-pointer">
                {KHOI_LOP.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} className="px-3 py-1.5 bg-transparent text-sm font-bold outline-none border-r border-slate-200 cursor-pointer">
                {MON_HOC_TIEU_HOC.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="px-3 py-1.5 bg-transparent text-sm font-bold outline-none text-indigo-600 cursor-pointer">
                {HOC_KY.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <button 
              onClick={() => setShowPpctInput(!showPpctInput)} 
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${showPpctInput ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <AlignLeft size={16} /> PPCT
            </button>

            <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <button 
              onClick={() => setShowApiKeyModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${apiKey ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse'}`}
              title="Cấu hình API Key"
            >
              <Settings size={16} /> {apiKey ? 'Cài đặt' : 'Nhập API'}
            </button>

            {isGeneratingBank ? (
              <button onClick={handleStopGenerating} className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl shadow-md text-sm font-bold animate-pulse">
                <Square size={16} fill="currentColor" /> Dừng tạo
              </button>
            ) : (
              <button onClick={handleGenerateBank} className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl shadow-md text-sm font-bold transition-all group active:scale-95">
                <Database size={16} className="group-hover:rotate-12 transition-transform" /> Tạo mẫu nhận xét
              </button>
            )}

            <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">
              <FileUp size={16} /> Nhập Excel
            </button>

            {viewMode === 'table' ? (
              <button onClick={exportTableToExcel} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-md text-sm font-bold active:scale-95 transition-all">
                <Download size={16} /> Xuất nhận xét
              </button>
            ) : (
              <button onClick={exportBankToExcel} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-md text-sm font-bold active:scale-95 transition-all">
                <FileSpreadsheet size={16} /> Xuất ngân hàng (.xlsx)
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {showPpctInput && (
          <div className="mb-8 bg-white p-6 rounded-[2rem] shadow-xl border border-indigo-100 animate-in slide-in-from-top duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <AlignLeft size={18} />
                </div>
                <h3 className="font-black uppercase tracking-tight text-slate-700">Phân phối chương trình (PPCT)</h3>
              </div>
              <button onClick={() => setShowPpctInput(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4 font-medium italic">
              * Tải lên file Phân phối chương trình (Word, Excel, PDF) để AI phân tích các bài học và chủ đề đã học trong học kỳ này.
            </p>
            
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.docx,.pdf" 
                  className="hidden" 
                  ref={ppctFileInputRef} 
                  onChange={handlePpctFileUpload} 
                />
                <button 
                  onClick={() => ppctFileInputRef.current?.click()}
                  disabled={isExtractingPpct}
                  className={`inline-flex items-center gap-2 px-6 py-3 text-white rounded-2xl shadow-lg text-sm font-bold transition-all active:scale-95 ${isExtractingPpct ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {isExtractingPpct ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Đang trích xuất bài học...
                    </>
                  ) : (
                    <>
                      <Upload size={18} /> Tải lên file PPCT (Word, Excel, PDF)
                    </>
                  )}
                </button>
                {ppct && !isExtractingPpct && (
                  <button 
                    onClick={() => setPpct('')}
                    className="text-xs text-rose-500 font-bold hover:underline"
                  >
                    Xóa dữ liệu đã tải
                  </button>
                )}
              </div>

              {isExtractingPpct ? (
                <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-12 text-center bg-indigo-50/30">
                  <Loader2 size={40} className="mx-auto mb-4 text-indigo-400 animate-spin" />
                  <p className="text-sm text-indigo-600 font-black uppercase tracking-widest">AI đang đọc và liệt kê danh sách bài học...</p>
                  <p className="text-xs text-slate-400 mt-2 font-medium italic">Vui lòng chờ trong giây lát, quá trình này có thể mất vài giây.</p>
                </div>
              ) : ppct ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 size={16} />
                      <span className="text-xs font-black uppercase tracking-wider">Danh sách bài học đã trích xuất</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">{ppct.split('\n').filter(l => l.trim()).length} bài học/chủ đề</span>
                  </div>
                  <div className="text-sm text-slate-600 font-medium leading-relaxed max-h-[500px] overflow-y-auto pr-4 whitespace-pre-wrap custom-scrollbar bg-white p-6 rounded-xl border border-slate-100 shadow-inner">
                    {ppct}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                  <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">Chưa có file PPCT nào được chọn</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex">
            <button onClick={() => setViewMode('table')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              <TableIcon size={18} className="inline mr-2" /> Học sinh
            </button>
            <button onClick={() => setViewMode('content')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'content' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              <FileJson size={18} className="inline mr-2" /> Ngân hàng mẫu
            </button>
          </div>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Tìm tên, ngày sinh, mã..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-300 rounded-2xl text-sm outline-none shadow-sm focus:ring-4 focus:ring-indigo-100 transition-all font-medium" />
          </div>
        </div>

        {notification && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center justify-between border shadow-sm ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'}`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className={notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'} />
              <span className="font-bold text-sm tracking-tight">{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="opacity-50 hover:opacity-100 text-xs uppercase font-black">Đóng</button>
          </div>
        )}

        <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden mb-12">
          {viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="table-bordered min-w-[1100px] border-none text-center">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b-2 border-slate-200">
                  <tr>
                    <th className="px-4 py-4 w-12 text-slate-400">STT</th>
                    <th className="px-6 py-4 w-56 text-left">Học sinh</th>
                    <th className="px-4 py-4 w-32">Ngày sinh</th>
                    <th className="px-4 py-4 w-28">Mức đạt</th>
                    <th className="px-4 py-4 w-24">Điểm KTĐK</th>
                    <th className="px-4 py-4 w-32">Mã NX</th>
                    <th className="px-6 py-4 text-left">Nội dung nhận xét (~150 ký tự)</th>
                    <th className="px-4 py-4 w-16 text-slate-400">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((r) => (
                    <tr key={r.stt} className="group hover:bg-indigo-50/40 transition-all">
                      <td className="px-4 py-5 text-xs text-slate-400 font-bold">{r.stt}</td>
                      <td className="px-6 py-5 text-sm font-bold text-slate-900 text-left">{r.hoTen}</td>
                      <td className="px-4 py-5 text-xs font-medium text-slate-500">{r.ngaySinh || "-"}</td>
                      <td className="px-4 py-5">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black border uppercase shadow-sm ${r.mucDo === 'T' ? 'bg-amber-50 text-amber-700 border-amber-200' : r.mucDo === 'H' ? 'bg-sky-50 text-sky-700 border-sky-200' : r.mucDo === 'C' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50'}`}>
                          {r.mucDo === 'T' ? 'HTT' : r.mucDo === 'H' ? 'HT' : r.mucDo === 'C' ? 'CHT' : 'TRỐNG'}
                        </span>
                      </td>
                      <td className="px-4 py-5 font-black text-slate-700 text-lg">{r.diem || "-"}</td>
                      <td className="px-4 py-5">
                        <span className="text-[10px] font-mono font-black bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-indigo-600 shadow-sm">{r.maNhanXet}</span>
                      </td>
                      <td className="px-6 py-5">
                        <textarea value={r.noiDung} onChange={(e) => setRecords(records.map(rec => rec.stt === r.stt ? { ...rec, noiDung: e.target.value } : rec))} className="w-full bg-transparent border-none text-sm font-medium resize-none min-h-[60px] outline-none leading-relaxed focus:bg-white focus:p-2 focus:rounded-lg transition-all" placeholder="Thông tin STT, Họ tên, NS, Điểm, Mức sẽ tự hiển thị sau khi nhập Excel..." />
                      </td>
                      <td className="px-4 py-5">
                        <button onClick={() => setRecords(records.filter(rec => rec.stt !== r.stt))} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-40 text-center opacity-30">
                        <Mountain size={64} className="mx-auto mb-4" />
                        <p className="font-bold uppercase tracking-widest text-sm">Chưa có dữ liệu học sinh. Hãy Nhập Excel môn {selectedSubject}.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-bordered w-full text-left border-none text-center">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="px-8 py-6 w-56">Mã nhận xét</th>
                    <th className="px-8 py-6 w-40">Mức đạt</th>
                    <th className="px-8 py-6 w-24">Điểm</th>
                    <th className="px-8 py-6 text-left">Mẫu nhận xét phổ thông</th>
                    <th className="px-4 py-6 w-16 text-slate-300">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commentBank.map((item, idx) => {
                    const abbr = getSubjectAbbr(selectedSubject);
                    const semesterAbbr = selectedSemester === "Giữa kì 1" ? "GK1" : 
                                        selectedSemester === "Cuối kì 1" ? "CK1" :
                                        selectedSemester === "Giữa kì 2" ? "GK2" : "CK2";
                    const sameGroup = commentBank.slice(0, idx + 1).filter(b => b.diem === item.diem && b.mucDo === item.mucDo);
                    const displayCode = `${abbr}${item.diem || ""}${semesterAbbr}${item.mucDo}${sameGroup.length}`;
                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/20 transition-all">
                        <td className="px-8 py-8">
                          <span className="text-xs font-black font-mono px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl shadow-sm">{displayCode}</span>
                        </td>
                        <td className="px-8 py-8">
                          <span className={`px-4 py-2 rounded-xl text-[10px] font-black border uppercase inline-block min-w-[140px] shadow-sm ${item.mucDo === 'T' ? 'bg-amber-50 text-amber-700 border-amber-200' : item.mucDo === 'H' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {item.mucDo === 'T' ? 'Tốt (10,9,8)' : item.mucDo === 'H' ? 'HT (7,6,5)' : 'CHT (4,3)'}
                          </span>
                        </td>
                        <td className="px-8 py-8 font-black text-slate-700 text-xl">{item.diem || "-"}</td>
                        <td className="px-8 py-8">
                          <textarea value={item.noiDung} onChange={(e) => setCommentBank(commentBank.map(b => b.id === item.id ? { ...b, noiDung: e.target.value } : b))} className="w-full bg-white border border-slate-200 rounded-2xl p-6 text-sm font-medium leading-relaxed min-h-[80px] outline-none shadow-sm focus:ring-4 focus:ring-indigo-50 transition-all resize-none" />
                        </td>
                        <td className="px-4 py-8">
                          <button onClick={() => setCommentBank(commentBank.filter(b => b.id !== item.id))} className="text-slate-200 hover:text-rose-500 transition-all"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-20 border-t border-slate-200 py-16 text-center bg-white/50">
        <div className="flex items-center justify-center gap-2 text-slate-300 mb-2">
          <Mountain size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Hỗ trợ giáo viên tiểu học</span>
        </div>
        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
          TRƯỜNG PTDTBT TH Nấm Dẩn | Thầy Nguyễn Đức Hùng | Phiên bản 12.0 - Tự động ghi nhận thông tin chính xác
        </div>
      </footer>
    </div>
  );
};

export default App;
