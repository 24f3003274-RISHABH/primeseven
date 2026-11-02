import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiRequest, formatPaiseToINR } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  FileCheck,
  HelpCircle,
  FileSpreadsheet,
  Unlock,
  IndianRupee,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit3,
  KeyRound,
  Database,
  Search,
  Eye,
  X,
  Gift,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { AdminMarketingReferralsModule } from './AdminMarketingReferralsModule.tsx';

type AdminTab =
  | 'overview'
  | 'subjects'
  | 'categories'
  | 'tests'
  | 'questions'
  | 'excel'
  | 'free_tests'
  | 'pricing'
  | 'students'
  | 'purchases_payments'
  | 'marketing_referrals'
  | 'reports'
  | 'settings';

const NAV_ITEMS: Array<{ id: AdminTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'overview', label: '1. Overview', icon: LayoutDashboard },
  { id: 'subjects', label: '2. Subjects', icon: BookOpen },
  { id: 'categories', label: '3. Test Categories', icon: Layers },
  { id: 'tests', label: '4. Tests', icon: FileCheck },
  { id: 'questions', label: '5. Questions', icon: HelpCircle },
  { id: 'excel', label: '6. Excel Upload', icon: FileSpreadsheet },
  { id: 'free_tests', label: '7. Free Test Configuration', icon: Unlock },
  { id: 'pricing', label: '8. Subject Pricing', icon: IndianRupee },
  { id: 'students', label: '9. Students', icon: Users },
  { id: 'purchases_payments', label: '10. Purchases & Payments', icon: CreditCard },
  { id: 'marketing_referrals', label: '11. Marketing & Referrals', icon: Gift },
  { id: 'reports', label: '12. Reports', icon: BarChart3 },
  { id: 'settings', label: '13. Settings', icon: Settings },
];

export const AdminDashboardPage: React.FC = () => {
  const { profile, logout, changePassword, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Shared Admin Data States
  const [overview, setOverview] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [freeConfigData, setFreeConfigData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [inspectedStudentData, setInspectedStudentData] = useState<any | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [settingsData, setSettingsData] = useState<any>(null);

  // Admin Password Change Form State
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [adminDisplayName, setAdminDisplayName] = useState(profile?.full_name || 'Prime Seven');

  // Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Filters & Form States
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('');

  // Test Creation / Edit Modal State
  const [editingTest, setEditingTest] = useState<any | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testForm, setTestForm] = useState({
    subject_id: 'subj-pol-sci',
    category_slug: 'sectional',
    title: '',
    test_number: 16,
    description: '',
    duration_minutes: 30,
    positive_marks: 4,
    negative_marks: 1,
    publication_status: 'published',
    display_order: 16,
  });

  // Question Bank State
  const [qbSubjectId, setQbSubjectId] = useState<string>('subj-pol-sci');
  const [qbTestId, setQbTestId] = useState<string>('test-political-science-sec-1');
  const [qbQuestions, setQbQuestions] = useState<any[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A',
    explanation: '',
    marks: 4,
    negative_marks: 1,
    display_order: 1,
  });

  // Excel Upload State
  const [excelSubjectId, setExcelSubjectId] = useState<string>('subj-pol-sci');
  const [excelTestId, setExcelTestId] = useState<string>('test-political-science-sec-1');
  const [excelPreview, setExcelPreview] = useState<any | null>(null);
  const [excelImportResult, setExcelImportResult] = useState<any | null>(null);

  // Manual Entitlement Form
  const [manualEntForm, setManualEntForm] = useState({
    user_id: '',
    subject_id: 'subj-pol-sci',
    action: 'grant',
    reason: '',
  });

  const notify = (type: 'success' | 'error', text: string) => {
    setBannerMsg({ type, text });
    setTimeout(() => setBannerMsg(null), 5000);
  };

  const loadCoreData = useCallback(async () => {
    try {
      const [ovRes, subjRes, testRes, pkgRes, freeRes] = await Promise.all([
        apiRequest('/api/v1/admin/overview'),
        apiRequest('/api/v1/admin/subjects'),
        apiRequest('/api/v1/admin/tests'),
        apiRequest('/api/v1/admin/packages'),
        apiRequest('/api/v1/admin/free-tests'),
      ]);
      setOverview(ovRes);
      setSubjects(subjRes.subjects || []);
      setTests(testRes.tests || []);
      setCategories(testRes.categories || []);
      setPackages(pkgRes.packages || []);
      setFreeConfigData(freeRes);
    } catch (err: any) {
      console.error('Admin load error:', err);
    }
  }, []);

  useEffect(() => {
    loadCoreData();
  }, [loadCoreData]);

  useEffect(() => {
    if (profile?.full_name) {
      setAdminDisplayName(profile.full_name);
    }
  }, [profile?.full_name]);

  useEffect(() => {
    if (activeTab === 'students' || activeTab === 'purchases_payments') {
      apiRequest('/api/v1/admin/students')
        .then((r) => {
          setStudents(r.students || []);
          if (r.students?.length > 0 && !manualEntForm.user_id) {
            setManualEntForm((prev) => ({ ...prev, user_id: r.students[0].id }));
          }
        })
        .catch(() => {});
    }
    if (activeTab === 'purchases_payments') {
      apiRequest('/api/v1/admin/purchases')
        .then((r) => setPurchases(r.purchases || []))
        .catch(() => {});
      apiRequest('/api/v1/admin/payments')
        .then(setPayments)
        .catch(() => {});
    }
    if (activeTab === 'settings') {
      Promise.all([
        apiRequest('/api/v1/admin/audit-logs'),
        apiRequest('/api/v1/admin/settings'),
      ])
        .then(([aud, cfg]) => {
          setAuditData(aud);
          setSettingsData(cfg);
        })
        .catch(() => {});
    }
  }, [activeTab, manualEntForm.user_id]);

  // Load questions when qbTestId changes
  const loadQuestionsForTest = useCallback(async (testId: string) => {
    if (!testId) return;
    try {
      const res = await apiRequest(`/api/v1/admin/tests/${testId}/questions`);
      setQbQuestions(res.questions || []);
      setQuestionForm((prev) => ({
        ...prev,
        display_order: (res.questions?.length || 0) + 1,
      }));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'questions' && qbTestId) {
      loadQuestionsForTest(qbTestId);
    }
  }, [activeTab, qbTestId, loadQuestionsForTest]);

  // Subject Update Handler
  const handleSaveSubject = async (subj: any) => {
    try {
      await apiRequest(`/api/v1/admin/subjects/${subj.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: subj.name,
          description: subj.description,
          is_active: subj.is_active,
          display_order: Number(subj.display_order),
        }),
      });
      notify('success', `Updated subject "${subj.name}".`);
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update subject.');
    }
  };

  // Create or Update Test Handler
  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTest) {
        await apiRequest(`/api/v1/admin/tests/${editingTest.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...testForm,
            test_number: Number(testForm.test_number),
            duration_minutes: Number(testForm.duration_minutes),
            positive_marks: Number(testForm.positive_marks),
            negative_marks: Number(testForm.negative_marks),
            display_order: Number(testForm.display_order),
          }),
        });
        notify('success', `Updated test "${testForm.title}".`);
      } else {
        await apiRequest('/api/v1/admin/tests', {
          method: 'POST',
          body: JSON.stringify({
            ...testForm,
            test_number: Number(testForm.test_number),
            duration_minutes: Number(testForm.duration_minutes),
            positive_marks: Number(testForm.positive_marks),
            negative_marks: Number(testForm.negative_marks),
            display_order: Number(testForm.display_order),
          }),
        });
        notify('success', `Created new premium test "${testForm.title}".`);
      }
      setShowTestModal(false);
      setEditingTest(null);
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Could not save test.');
    }
  };

  // Save Question Handler
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingQuestion) {
        await apiRequest(`/api/v1/admin/questions/${editingQuestion.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...questionForm,
            marks: Number(questionForm.marks),
            negative_marks: Number(questionForm.negative_marks),
            display_order: Number(questionForm.display_order),
          }),
        });
        notify('success', 'Question updated.');
      } else {
        await apiRequest('/api/v1/admin/questions', {
          method: 'POST',
          body: JSON.stringify({
            test_id: qbTestId,
            ...questionForm,
            marks: Number(questionForm.marks),
            negative_marks: Number(questionForm.negative_marks),
            display_order: Number(questionForm.display_order),
          }),
        });
        notify('success', 'New question added to test.');
      }
      setEditingQuestion(null);
      setQuestionForm({
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_option: 'A',
        explanation: '',
        marks: 4,
        negative_marks: 1,
        display_order: qbQuestions.length + 2,
      });
      await loadQuestionsForTest(qbTestId);
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save question.');
    }
  };

  const handleDeleteQuestion = (q: any) => {
    setConfirmDialog({
      title: `Delete Question #${q.display_order}?`,
      message: `Are you sure you want to delete Question #${q.display_order} ("${q.question_text.slice(0, 80)}...")? Total test marks will be recalculated automatically.`,
      confirmLabel: 'Delete Question',
      onConfirm: async () => {
        try {
          await apiRequest(`/api/v1/admin/questions/${q.id}`, { method: 'DELETE' });
          notify('success', 'Question deleted.');
          await loadQuestionsForTest(qbTestId);
          await loadCoreData();
        } catch (err: any) {
          notify('error', err.message || 'Could not delete question.');
        }
      },
    });
  };

  const handleDeleteOrArchiveTest = (t: any) => {
    setConfirmDialog({
      title: `Delete or Archive "${t.title}"?`,
      message:
        'If students have already attempted this test, it will be safely unpublished to preserve student results. Otherwise, the test and its questions will be permanently removed.',
      confirmLabel: 'Confirm Remove / Archive',
      onConfirm: async () => {
        try {
          const res = await apiRequest(`/api/v1/admin/tests/${t.id}`, { method: 'DELETE' });
          if (res.archived) {
            notify('success', res.message || `Unpublished test "${t.title}".`);
          } else {
            notify('success', `Deleted test "${t.title}".`);
          }
          await loadCoreData();
        } catch (err: any) {
          notify('error', err.message || 'Could not remove test.');
        }
      },
    });
  };

  const handleInspectStudent = async (studentId: string) => {
    try {
      const res = await apiRequest(`/api/v1/admin/students/${studentId}/attempts`);
      setInspectedStudentData(res);
    } catch (err: any) {
      notify('error', err.message || 'Could not load student details.');
    }
  };

  const handleAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password.length < 8) {
      notify('error', 'New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      notify('error', 'New password and confirmation do not match.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await changePassword(
        passwordForm.current_password,
        passwordForm.new_password,
        passwordForm.confirm_password
      );
      if (res.success) {
        notify('success', 'Administrator password updated.');
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
        const [aud, cfg] = await Promise.all([
          apiRequest('/api/v1/admin/audit-logs'),
          apiRequest('/api/v1/admin/settings'),
        ]);
        setAuditData(aud);
        setSettingsData(cfg);
      } else {
        notify('error', res.error || 'Failed to update password.');
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/v1/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: adminDisplayName.trim() }),
      });
      await refreshProfile();
      notify('success', 'Administrator display name updated.');
    } catch (err: any) {
      notify('error', err.message || 'Could not update administrator display name.');
    }
  };

  const handleRunDbMigrations = async () => {
    try {
      const res = await apiRequest('/api/v1/admin/migrations/run', { method: 'POST' });
      notify('success', res.message || 'Database migrations and catalogue sync verified.');
    } catch (err: any) {
      notify('error', err.message || 'Database migration check failed.');
    }
  };

  // Excel Sample Download & File Upload Handlers
  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      {
        subject: 'Political Science',
        category: 'sectional',
        test_number: 1,
        test_title: 'Sectional Test 1',
        question_number: 1,
        question_text:
          'Who authored the treatise "Leviathan" (1651) articulating social contract theory under an absolute sovereign?',
        option_a: 'Thomas Hobbes',
        option_b: 'John Locke',
        option_c: 'Jean-Jacques Rousseau',
        option_d: 'Niccolò Machiavelli',
        correct_option: 'A',
        solution:
          'Thomas Hobbes published Leviathan in 1651, arguing that individuals in the state of nature covenant to establish an undivided sovereign authority.',
        marks: 4,
        negative_marks: 1,
      },
      {
        subject: 'Political Science',
        category: 'sectional',
        test_number: 1,
        test_title: 'Sectional Test 1',
        question_number: 2,
        question_text:
          'Which Schedule of the Constitution of India contains provisions regarding disqualification of legislators on grounds of defection?',
        option_a: 'Eighth Schedule',
        option_b: 'Ninth Schedule',
        option_c: 'Tenth Schedule',
        option_d: 'Twelfth Schedule',
        correct_option: 'C',
        solution:
          'The Tenth Schedule (Anti-Defection Law) was added by the 52nd Constitutional Amendment Act, 1985.',
        marks: 4,
        negative_marks: 1,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PrimePrep_Questions');
    XLSX.writeFile(wb, 'PrimePrep_CUET_PG_Question_Template.xlsx');
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet);

      const validationRes = await apiRequest('/api/v1/admin/excel/validate', {
        method: 'POST',
        body: JSON.stringify({
          test_id: excelTestId,
          rows: jsonRows,
        }),
      });
      setExcelPreview(validationRes);
    } catch (err: any) {
      notify('error', err.message || 'Failed to parse or validate Excel file.');
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelPreview) return;
    const validRows = excelPreview.rows.filter((r: any) => r.isValid);
    if (validRows.length === 0) {
      notify('error', 'No valid rows available to import.');
      return;
    }

    try {
      const res = await apiRequest('/api/v1/admin/excel/import', {
        method: 'POST',
        body: JSON.stringify({
          test_id: excelTestId,
          rows: validRows,
        }),
      });
      setExcelImportResult(res);
      setExcelPreview(null);
      notify('success', `Successfully imported ${res.imported_count} questions.`);
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Batch import failed.');
    }
  };

  // Save Free Test Global Designation
  const handleSaveFreeTestConfig = async (
    freeSectionalId: string | null,
    freePyqId: string | null
  ) => {
    try {
      await apiRequest('/api/v1/admin/free-tests', {
        method: 'PUT',
        body: JSON.stringify({
          free_sectional_test_id: freeSectionalId || null,
          free_pyq_test_id: freePyqId || null,
        }),
      });
      notify(
        'success',
        'Updated global free test designations (1 Sectional + 1 PYQ across platform).'
      );
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update free test configuration.');
    }
  };

  // Save Subject Package Pricing (in integer paise)
  const handleSavePackagePrice = async (pkg: any, rupeesValue: number, available: boolean) => {
    const pricePaise = Math.round(rupeesValue * 100);
    try {
      await apiRequest(`/api/v1/admin/packages/${pkg.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          price_paise: pricePaise,
          is_available_for_sale: available,
        }),
      });
      notify(
        'success',
        `Updated ${pkg.subject_name} package price to ₹${rupeesValue} (${pricePaise} paise).`
      );
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update package price.');
    }
  };

  // Manual Entitlement Action
  const handleManualEntitlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/v1/admin/purchases/manual', {
        method: 'POST',
        body: JSON.stringify(manualEntForm),
      });
      notify('success', `Manual entitlement (${manualEntForm.action}) recorded with audit log.`);
      setManualEntForm((prev) => ({ ...prev, reason: '' }));
      const purRes = await apiRequest('/api/v1/admin/purchases');
      setPurchases(purRes.purchases || []);
      await loadCoreData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to execute manual entitlement change.');
    }
  };

  const filteredAdminTests = tests.filter((t) => {
    if (selectedSubjectFilter && t.subject_id !== selectedSubjectFilter) return false;
    if (selectedCategoryFilter && t.category_slug !== selectedCategoryFilter) return false;
    return true;
  });

  const filteredStudents = students.filter((u) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase().trim();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col lg:flex-row bg-slate-50">
      {/* Desktop Sidebar Navigation (260px) */}
      <aside className="lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="p-5 border-b border-slate-100">
            <p className="text-[11px] font-mono font-semibold text-blue-700 uppercase">
              ADMINISTRATION CONSOLE
            </p>
            <h2 className="mt-0.5 text-base font-bold text-slate-900 font-display truncate">
              {profile?.full_name || 'Prime Seven'}
            </h2>
            <p className="text-xs text-slate-500 font-mono truncate">
              {profile?.email || 'primeseven@gmail.com'}
            </p>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer lg:mt-2 lg:border-t lg:border-slate-100 lg:pt-3"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>13. Logout</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 p-6 sm:p-8 max-w-6xl">
        {profile?.must_change_password && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Security Notice: Initial Password Active</p>
                <p className="mt-0.5">
                  Your official administrator account was initialized from the bootstrap environment
                  variable. Please set a permanent password in Settings.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Change Password Now
            </button>
          </div>
        )}

        {bannerMsg && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              bannerMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {bannerMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
        )}

        {/* ==================================================================
            MODULE 1: OVERVIEW
        ================================================================== */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Platform Executive Overview
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Live operational metrics calculated directly from database records. Only verified
                captured payments count toward revenue.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Registered Students</span>
                <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                  {overview.metrics.registered_students}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Active Accounts</span>
                <span className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums block">
                  {overview.metrics.active_users}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Published Tests</span>
                <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                  {overview.metrics.total_published_tests}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Question Bank</span>
                <span className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums block">
                  {overview.metrics.total_questions.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Verified Purchases</span>
                <span className="mt-1 text-2xl font-bold text-blue-700 font-mono tabular-nums block">
                  {overview.metrics.verified_purchases}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] text-slate-500 block">Verified Revenue</span>
                <span className="mt-1 text-2xl font-bold text-emerald-700 font-mono tabular-nums block">
                  {formatPaiseToINR(overview.metrics.total_revenue_paise)}
                </span>
              </div>
            </div>

            {/* Subject-Wise Sales Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900 font-display">
                  Subject-Wise Package Sales & Verified Revenue
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Subject</th>
                      <th className="py-3 px-4 font-semibold">Paper Code</th>
                      <th className="py-3 px-4 font-semibold text-right">Package Price</th>
                      <th className="py-3 px-4 font-semibold text-right">Active Entitlements</th>
                      <th className="py-3 px-4 font-semibold text-right">Verified Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.subject_sales.map((s: any) => (
                      <tr key={s.subject_id}>
                        <td className="py-3 px-4 font-semibold text-slate-900">{s.subject_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{s.paper_code}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatPaiseToINR(s.price_paise)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          {s.purchases_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatPaiseToINR(s.revenue_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 2: SUBJECT MANAGEMENT
        ================================================================== */}
        {activeTab === 'subjects' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Subject Catalogue Management (7 CUET PG Subjects)
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Edit descriptions, toggle active availability, and adjust display order. Duplicate
                subject names are blocked.
              </p>
            </div>

            <div className="space-y-4">
              {subjects.map((subj, idx) => (
                <div
                  key={subj.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                        Subject Name ({subj.paper_code})
                      </label>
                      <input
                        type="text"
                        value={subj.name}
                        onChange={(e) => {
                          const copy = [...subjects];
                          copy[idx].name = e.target.value;
                          setSubjects(copy);
                        }}
                        className="mt-1 w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                        Display Order
                      </label>
                      <input
                        type="number"
                        value={subj.display_order}
                        onChange={(e) => {
                          const copy = [...subjects];
                          copy[idx].display_order = Number(e.target.value);
                          setSubjects(copy);
                        }}
                        className="mt-1 w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                        Published Tests
                      </label>
                      <p className="mt-2 text-xs font-mono font-bold text-slate-800">
                        {subj.published_tests_count} / {subj.tests_count} Total
                      </p>
                    </div>

                    <div className="md:col-span-3 flex items-center justify-end gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subj.is_active}
                          onChange={(e) => {
                            const copy = [...subjects];
                            copy[idx].is_active = e.target.checked;
                            setSubjects(copy);
                          }}
                        />
                        <span>Active</span>
                      </label>

                      <button
                        onClick={() => handleSaveSubject(subj)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                      Syllabus & Series Description
                    </label>
                    <textarea
                      rows={2}
                      value={subj.description}
                      onChange={(e) => {
                        const copy = [...subjects];
                        copy[idx].description = e.target.value;
                        setSubjects(copy);
                      }}
                      className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 3: TEST CATEGORIES
        ================================================================== */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Normalized Test Categories
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Every subject is structured strictly around these three categories without chapter
                intermediaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {categories.map((cat) => {
                const count = tests.filter((t) => t.category_slug === cat.slug).length;
                return (
                  <div
                    key={cat.id}
                    className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-blue-700">
                      <span>SLUG: {cat.slug}</span>
                      <span>Order #{cat.display_order}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 font-display">{cat.name}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{cat.description}</p>
                    <div className="pt-3 border-t border-slate-100 flex justify-between text-xs font-mono">
                      <span>Default: {cat.default_duration_minutes} mins</span>
                      <span className="font-bold">{count} Tests Across 7 Subjects</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 4: TEST MANAGEMENT
        ================================================================== */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 font-display">
                  Dynamic Test Management ({filteredAdminTests.length} Tests)
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Create, edit, change durations, reorder, and publish or unpublish tests. New tests
                  are created as premium by default with no chapter fields.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingTest(null);
                  setTestForm({
                    subject_id: selectedSubjectFilter || 'subj-pol-sci',
                    category_slug: (selectedCategoryFilter as any) || 'sectional',
                    title: 'Sectional Test 16: Contemporary Political Analysis',
                    test_number: 16,
                    description: 'Advanced CUET PG practice test added dynamically.',
                    duration_minutes: 30,
                    positive_marks: 4,
                    negative_marks: 1,
                    publication_status: 'published',
                    display_order: 16,
                  });
                  setShowTestModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Test</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  Filter by Subject
                </label>
                <select
                  value={selectedSubjectFilter}
                  onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="">All 7 Subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.paper_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  Filter by Category
                </label>
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="">All 3 Categories</option>
                  <option value="sectional">Sectional Tests</option>
                  <option value="full_length">Full-Length Tests</option>
                  <option value="pyq">PYQ Tests</option>
                </select>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[540px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Subject</th>
                      <th className="py-3 px-4 font-semibold">Category</th>
                      <th className="py-3 px-4 font-semibold">#</th>
                      <th className="py-3 px-4 font-semibold">Test Title</th>
                      <th className="py-3 px-4 font-semibold text-right">Duration</th>
                      <th className="py-3 px-4 font-semibold text-right">Qs / Marks</th>
                      <th className="py-3 px-4 font-semibold">Access</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAdminTests.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-800">{t.subject_name}</td>
                        <td className="py-3 px-4 font-mono uppercase text-slate-600">
                          {t.category_slug}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold tabular-nums">
                          #{t.test_number}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{t.title}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {t.duration_minutes}m
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {t.total_questions} Qs ({t.maximum_marks}M)
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              t.access_type === 'free' ? 'text-emerald-700' : 'text-slate-600'
                            }`}
                          >
                            {t.access_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              t.publication_status === 'published'
                                ? 'text-blue-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {t.publication_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              onClick={() => {
                                setQbSubjectId(t.subject_id);
                                setQbTestId(t.id);
                                setActiveTab('questions');
                              }}
                              className="text-slate-700 font-semibold hover:underline cursor-pointer"
                            >
                              Questions
                            </button>
                            <button
                              onClick={() => {
                                setEditingTest(t);
                                setTestForm({
                                  subject_id: t.subject_id,
                                  category_slug: t.category_slug,
                                  title: t.title,
                                  test_number: t.test_number,
                                  description: t.description,
                                  duration_minutes: t.duration_minutes,
                                  positive_marks: t.positive_marks,
                                  negative_marks: t.negative_marks,
                                  publication_status: t.publication_status,
                                  display_order: t.display_order,
                                });
                                setShowTestModal(true);
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteOrArchiveTest(t)}
                              className="inline-flex items-center gap-1 text-red-600 font-semibold hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showTestModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveTest}
                  className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
                >
                  <h3 className="text-lg font-bold text-slate-900 font-display">
                    {editingTest ? `Edit Test: ${editingTest.title}` : 'Create New Mock Test'}
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Subject</label>
                      <select
                        value={testForm.subject_id}
                        onChange={(e) => setTestForm({ ...testForm, subject_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      >
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Category</label>
                      <select
                        value={testForm.category_slug}
                        onChange={(e) =>
                          setTestForm({ ...testForm, category_slug: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      >
                        <option value="sectional">Sectional Test</option>
                        <option value="full_length">Full-Length Test</option>
                        <option value="pyq">PYQ Test</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block font-semibold text-slate-600 mb-1">Test Title</label>
                    <input
                      type="text"
                      required
                      value={testForm.title}
                      onChange={(e) => setTestForm({ ...testForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="text-xs">
                    <label className="block font-semibold text-slate-600 mb-1">Description</label>
                    <textarea
                      rows={2}
                      required
                      value={testForm.description}
                      onChange={(e) => setTestForm({ ...testForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Test Number</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={testForm.test_number}
                        onChange={(e) =>
                          setTestForm({ ...testForm, test_number: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Duration (Mins)
                      </label>
                      <input
                        type="number"
                        required
                        min={5}
                        value={testForm.duration_minutes}
                        onChange={(e) =>
                          setTestForm({ ...testForm, duration_minutes: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Publication Status
                      </label>
                      <select
                        value={testForm.publication_status}
                        onChange={(e) =>
                          setTestForm({ ...testForm, publication_status: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="unpublished">Unpublished</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Positive Marks
                      </label>
                      <input
                        type="number"
                        required
                        value={testForm.positive_marks}
                        onChange={(e) =>
                          setTestForm({ ...testForm, positive_marks: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Negative Marks
                      </label>
                      <input
                        type="number"
                        required
                        value={testForm.negative_marks}
                        onChange={(e) =>
                          setTestForm({ ...testForm, negative_marks: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Display Order
                      </label>
                      <input
                        type="number"
                        required
                        value={testForm.display_order}
                        onChange={(e) =>
                          setTestForm({ ...testForm, display_order: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowTestModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      Save Test
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            MODULE 5: QUESTION BANK
        ================================================================== */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Question Bank & Answer Key Management
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Select any test to add, edit, reorder, or delete single-correct MCQ questions.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  1. Select Subject
                </label>
                <select
                  value={qbSubjectId}
                  onChange={(e) => {
                    const newSubj = e.target.value;
                    setQbSubjectId(newSubj);
                    const firstTest = tests.find((t) => t.subject_id === newSubj);
                    if (firstTest) setQbTestId(firstTest.id);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.paper_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  2. Select Test
                </label>
                <select
                  value={qbTestId}
                  onChange={(e) => setQbTestId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {tests
                    .filter((t) => t.subject_id === qbSubjectId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.category_slug.toUpperCase()}] {t.title} ({t.total_questions} Qs)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Add / Edit Question Form */}
            <form
              onSubmit={handleSaveQuestion}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 font-display">
                  {editingQuestion
                    ? `Editing Question #${editingQuestion.display_order}`
                    : 'Add New Question to Selected Test'}
                </h2>
                {editingQuestion && (
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className="text-xs text-slate-500 underline cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Question Stem</label>
                <textarea
                  rows={2}
                  required
                  value={questionForm.question_text}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, question_text: e.target.value })
                  }
                  placeholder="Enter full CUET PG MCQ stem..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Option A</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_a}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, option_a: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Option B</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_b}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, option_b: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Option C</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_c}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, option_c: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Option D</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_d}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, option_d: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Correct Option</label>
                  <select
                    value={questionForm.correct_option}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, correct_option: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-bold"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Positive Marks</label>
                  <input
                    type="number"
                    required
                    value={questionForm.marks}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, marks: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Negative Marks</label>
                  <input
                    type="number"
                    required
                    value={questionForm.negative_marks}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, negative_marks: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Display Order</label>
                  <input
                    type="number"
                    required
                    value={questionForm.display_order}
                    onChange={(e) =>
                      setQuestionForm({ ...questionForm, display_order: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Detailed Solution / Explanation
                </label>
                <textarea
                  rows={2}
                  required
                  value={questionForm.explanation}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, explanation: e.target.value })
                  }
                  placeholder="Provide academic explanation revealed after submission..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                {editingQuestion ? 'Update Question' : 'Add Question to Test'}
              </button>
            </form>

            {/* Existing Questions List */}
            <div className="space-y-3">
              {qbQuestions.map((q) => (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      Q#{q.display_order} · Correct: Option {q.correct_option} (+{q.marks} / -
                      {q.negative_marks})
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingQuestion(q);
                          setQuestionForm({
                            question_text: q.question_text,
                            option_a: q.option_a,
                            option_b: q.option_b,
                            option_c: q.option_c,
                            option_d: q.option_d,
                            correct_option: q.correct_option,
                            explanation: q.explanation,
                            marks: q.marks,
                            negative_marks: q.negative_marks,
                            display_order: q.display_order,
                          });
                        }}
                        className="text-blue-700 font-semibold hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q)}
                        className="text-red-600 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{q.question_text}</p>
                  <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
                    <span>A: {q.option_a}</span>
                    <span>B: {q.option_b}</span>
                    <span>C: {q.option_c}</span>
                    <span>D: {q.option_d}</span>
                  </div>
                  <p className="text-slate-500 pt-1 border-t border-slate-100">
                    <strong>Solution:</strong> {q.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 6: EXCEL UPLOAD
        ================================================================== */}
        {activeTab === 'excel' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 font-display">
                  Excel (XLSX) Batch Question Upload
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Validate spreadsheet rows, preview row-specific errors, prevent duplicate
                  questions, and safely batch-import valid items.
                </p>
              </div>

              <button
                onClick={handleDownloadSampleExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Sample .XLSX Template</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                    1. Select Target Subject
                  </label>
                  <select
                    value={excelSubjectId}
                    onChange={(e) => {
                      const newSubj = e.target.value;
                      setExcelSubjectId(newSubj);
                      const firstTest = tests.find((t) => t.subject_id === newSubj);
                      if (firstTest) setExcelTestId(firstTest.id);
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.paper_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                    2. Select Target Test
                  </label>
                  <select
                    value={excelTestId}
                    onChange={(e) => setExcelTestId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    {tests
                      .filter((t) => t.subject_id === excelSubjectId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.category_slug.toUpperCase()}] {t.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="p-6 border-2 border-dashed border-slate-300 rounded-xl text-center bg-slate-50">
                <Upload className="w-6 h-6 text-blue-700 mx-auto" />
                <p className="mt-2 text-xs font-semibold text-slate-800">
                  Upload .XLSX or .XLS Question Spreadsheet
                </p>
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Columns: subject, category, test_number, test_title, question_number,
                  question_text, option_a, option_b, option_c, option_d, correct_option, solution,
                  marks, negative_marks
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileUpload}
                  className="mt-4 text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer"
                />
              </div>

              {excelPreview && (
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span>Total Rows: {excelPreview.total_rows}</span>
                      <span className="text-emerald-700 font-bold">
                        Valid Rows: {excelPreview.valid_count}
                      </span>
                      <span className="text-red-600 font-bold">
                        Invalid Rows: {excelPreview.invalid_count}
                      </span>
                    </div>

                    <button
                      onClick={handleConfirmExcelImport}
                      disabled={excelPreview.valid_count === 0}
                      className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded-lg cursor-pointer"
                    >
                      Confirm & Import {excelPreview.valid_count} Valid Questions
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2.5 px-3">Row</th>
                          <th className="py-2.5 px-3">Question Stem</th>
                          <th className="py-2.5 px-3">Ans</th>
                          <th className="py-2.5 px-3">Validation Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {excelPreview.rows.map((r: any) => (
                          <tr key={r.rowNumber} className={r.isValid ? '' : 'bg-red-50/60'}>
                            <td className="py-2.5 px-3 font-mono">#{r.rowNumber}</td>
                            <td className="py-2.5 px-3 max-w-md truncate">{r.question_text}</td>
                            <td className="py-2.5 px-3 font-mono font-bold">{r.correct_option}</td>
                            <td className="py-2.5 px-3">
                              {r.isValid ? (
                                <span className="text-emerald-700 font-semibold">Valid</span>
                              ) : (
                                <span className="text-red-600 font-semibold">
                                  {r.errors.join('; ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {excelImportResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  Import Complete: <strong>{excelImportResult.imported_count}</strong> questions
                  imported, <strong>{excelImportResult.skipped_count}</strong> duplicates skipped.
                  Target test now has <strong>{excelImportResult.total_test_questions}</strong>{' '}
                  questions.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 7: GLOBAL FREE-TEST CONFIGURATION
        ================================================================== */}
        {activeTab === 'free_tests' && freeConfigData && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Global Free-Test Configuration
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                PrimePrep enforces at most ONE globally designated free Sectional Test and ONE
                globally designated free PYQ Test across the entire platform. Full-Length Tests
                remain strictly premium.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">
                  1. Globally Designated Free Sectional Test (Max 1 Across Platform)
                </label>
                <select
                  value={freeConfigData.config.free_sectional_test_id || ''}
                  onChange={(e) =>
                    setFreeConfigData({
                      ...freeConfigData,
                      config: {
                        ...freeConfigData.config,
                        free_sectional_test_id: e.target.value || null,
                      },
                    })
                  }
                  className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="">— No Free Sectional Test Designated (All Premium) —</option>
                  {freeConfigData.sectional_tests.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      [{t.subject_name}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-2">
                  2. Globally Designated Free PYQ Test (Max 1 Across Platform)
                </label>
                <select
                  value={freeConfigData.config.free_pyq_test_id || ''}
                  onChange={(e) =>
                    setFreeConfigData({
                      ...freeConfigData,
                      config: {
                        ...freeConfigData.config,
                        free_pyq_test_id: e.target.value || null,
                      },
                    })
                  }
                  className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="">— No Free PYQ Test Designated (All Premium) —</option>
                  {freeConfigData.pyq_tests.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      [{t.subject_name}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                Changing a designated free test automatically reverts the previously free test to
                premium unless another test is designated. Full-Length Tests are excluded from free
                designation by platform invariant.
              </div>

              <button
                onClick={() =>
                  handleSaveFreeTestConfig(
                    freeConfigData.config.free_sectional_test_id,
                    freeConfigData.config.free_pyq_test_id
                  )
                }
                className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Save Global Free-Test Configuration
              </button>
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 8: SUBJECT-SERIES PRICING
        ================================================================== */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Subject-Series Package Pricing (Integer Paise)
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Configure the complete subject-series package price for each of the seven subjects.
                Changing a package price never alters historical completed transaction amounts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((pkg, idx) => {
                const rupees = Math.round(pkg.price_paise / 100);
                return (
                  <div
                    key={pkg.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono text-blue-700 font-semibold">
                          {pkg.paper_code}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 font-display">
                          {pkg.subject_name}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-slate-500">
                        {pkg.included_tests_count} Published Tests
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Price (INR ₹)
                        </label>
                        <input
                          type="number"
                          min={10}
                          value={rupees}
                          onChange={(e) => {
                            const copy = [...packages];
                            copy[idx].price_paise = Math.round(Number(e.target.value) * 100);
                            setPackages(copy);
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-bold"
                        />
                        <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">
                          Stored as: {pkg.price_paise} paise
                        </span>
                      </div>

                      <div className="flex flex-col justify-between">
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 mt-6 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pkg.is_available_for_sale}
                            onChange={(e) => {
                              const copy = [...packages];
                              copy[idx].is_available_for_sale = e.target.checked;
                              setPackages(copy);
                            }}
                          />
                          <span>Available for Sale</span>
                        </label>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-600">
                        Purchases: <strong>{pkg.purchases_count}</strong> · Revenue:{' '}
                        <strong>{formatPaiseToINR(pkg.revenue_paise)}</strong>
                      </span>
                      <button
                        onClick={() =>
                          handleSavePackagePrice(pkg, rupees, pkg.is_available_for_sale)
                        }
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        Update Price
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 9: STUDENTS
        ================================================================== */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 font-display">
                  Registered Students & Account Status ({filteredStudents.length})
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Search registered candidates, inspect their subject entitlements and test
                  attempts, or manage account status.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Full Name</th>
                      <th className="py-3 px-4 font-semibold">Email</th>
                      <th className="py-3 px-4 font-semibold">Role</th>
                      <th className="py-3 px-4 font-semibold">Unlocked Subjects</th>
                      <th className="py-3 px-4 font-semibold text-right">Attempts</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-900">{u.full_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                        <td className="py-3 px-4 font-mono uppercase">{u.role}</td>
                        <td className="py-3 px-4">
                          {u.purchased_subjects?.length > 0
                            ? u.purchased_subjects.join(', ')
                            : 'None'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {u.attempts_count}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              u.account_status === 'active' ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {u.account_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              onClick={() => handleInspectStudent(u.id)}
                              className="inline-flex items-center gap-1 text-slate-700 font-semibold hover:underline cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                            {u.role !== 'admin' && (
                              <button
                                onClick={async () => {
                                  const nextStatus =
                                    u.account_status === 'active' ? 'suspended' : 'active';
                                  try {
                                    await apiRequest(`/api/v1/admin/students/${u.id}/status`, {
                                      method: 'PUT',
                                      body: JSON.stringify({ account_status: nextStatus }),
                                    });
                                    const r = await apiRequest('/api/v1/admin/students');
                                    setStudents(r.students || []);
                                    notify('success', `Updated account status to ${nextStatus}.`);
                                  } catch (err: any) {
                                    notify('error', err.message || 'Could not update status.');
                                  }
                                }}
                                className="text-blue-700 font-semibold hover:underline cursor-pointer"
                              >
                                {u.account_status === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {inspectedStudentData && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-xl max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-mono text-blue-700 uppercase">
                        CANDIDATE RECORD INSPECTION
                      </p>
                      <h3 className="text-lg font-bold text-slate-900 font-display">
                        {inspectedStudentData.student.full_name} (
                        {inspectedStudentData.student.email})
                      </h3>
                    </div>
                    <button
                      onClick={() => setInspectedStudentData(null)}
                      className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase mb-2">
                      Subject Package Entitlements ({inspectedStudentData.purchases.length})
                    </h4>
                    {inspectedStudentData.purchases.length === 0 ? (
                      <p className="text-xs text-slate-500">No subject packages unlocked yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl text-xs">
                        {inspectedStudentData.purchases.map((p: any) => (
                          <div key={p.id} className="p-3 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-slate-900">
                                {p.subject_name}
                              </span>
                              <span className="text-slate-500 ml-2">({p.package_name})</span>
                            </div>
                            <span
                              className={`font-mono font-bold uppercase ${
                                p.entitlement_status === 'active'
                                  ? 'text-emerald-700'
                                  : 'text-red-600'
                              }`}
                            >
                              {p.entitlement_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase mb-2">
                      Examination Attempts ({inspectedStudentData.attempts.length})
                    </h4>
                    {inspectedStudentData.attempts.length === 0 ? (
                      <p className="text-xs text-slate-500">No examinations attempted yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl text-xs">
                        {inspectedStudentData.attempts.map((a: any) => (
                          <div key={a.id} className="p-3 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{a.test_title}</p>
                              <p className="text-slate-500">
                                {a.subject_name} · Status: {a.status}
                              </p>
                            </div>
                            <div className="text-right font-mono">
                              <p className="font-bold text-slate-900">
                                {a.total_score} / {a.maximum_marks}
                              </p>
                              <p className="text-slate-500">
                                +{a.positive_marks_total} / -{a.negative_marks_total}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            MODULE 10: PURCHASES & PAYMENTS
        ================================================================== */}
        {activeTab === 'purchases_payments' && (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Purchases, Entitlements & Payment Transactions
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Manage subject-series entitlements with mandatory audit logging and inspect
                cryptographically verified Razorpay payment transactions.
              </p>
            </div>

            {/* Audited Manual Entitlement Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Manual Entitlement Grant / Revoke (Audited Administrative Action)
              </h2>
              <form
                onSubmit={handleManualEntitlementSubmit}
                className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end text-xs"
              >
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Student</label>
                  <select
                    value={manualEntForm.user_id}
                    onChange={(e) =>
                      setManualEntForm({ ...manualEntForm, user_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Subject</label>
                  <select
                    value={manualEntForm.subject_id}
                    onChange={(e) =>
                      setManualEntForm({ ...manualEntForm, subject_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Action</label>
                  <select
                    value={manualEntForm.action}
                    onChange={(e) => setManualEntForm({ ...manualEntForm, action: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="grant">Grant Entitlement</option>
                    <option value="revoke">Revoke Entitlement</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Mandatory Audit Reason
                  </label>
                  <input
                    type="text"
                    required
                    minLength={5}
                    value={manualEntForm.reason}
                    onChange={(e) => setManualEntForm({ ...manualEntForm, reason: e.target.value })}
                    placeholder="Scholarship / support ticket #..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="py-2 px-4 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Apply Audited Action
                </button>
              </form>
            </div>

            {/* Active & Historical Purchases Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900 font-display">
                  Subject-Series Entitlements ({purchases.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Student</th>
                      <th className="py-3 px-4 font-semibold">Subject Package</th>
                      <th className="py-3 px-4 font-semibold">Transaction Ref</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No subject entitlements recorded yet.
                        </td>
                      </tr>
                    ) : (
                      purchases.map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{p.student_name}</p>
                            <p className="text-slate-500">{p.student_email}</p>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {p.subject_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {p.gateway_payment_id}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {formatPaiseToINR(p.amount_paise)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-semibold ${
                                p.entitlement_status === 'active'
                                  ? 'text-emerald-700'
                                  : 'text-red-600'
                              }`}
                            >
                              {p.entitlement_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {new Date(p.purchased_at).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Gateway Transactions Ledger */}
            {payments && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="text-sm font-bold text-slate-900 font-display">
                    Gateway Orders & Payment Transactions Ledger ({payments.transactions.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-3 px-4 font-semibold">Student</th>
                        <th className="py-3 px-4 font-semibold">Subject</th>
                        <th className="py-3 px-4 font-semibold">Gateway Order ID</th>
                        <th className="py-3 px-4 font-semibold">Gateway Payment ID</th>
                        <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        <th className="py-3 px-4 font-semibold">Payment Status</th>
                        <th className="py-3 px-4 font-semibold">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No payment transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        payments.transactions.map((t: any) => (
                          <tr key={t.id}>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900">{t.student_name}</p>
                              <p className="text-slate-500">{t.student_email}</p>
                            </td>
                            <td className="py-3 px-4 font-medium">{t.subject_name}</td>
                            <td className="py-3 px-4 font-mono">{t.gateway_order_id}</td>
                            <td className="py-3 px-4 font-mono">{t.gateway_payment_id}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                              {formatPaiseToINR(t.amount_paise)} ({t.amount_paise}p)
                            </td>
                            <td className="py-3 px-4 font-mono uppercase">{t.payment_status}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-semibold ${
                                  t.verification_status === 'verified'
                                    ? 'text-emerald-700'
                                    : t.verification_status === 'pending'
                                    ? 'text-amber-700'
                                    : 'text-red-600'
                                }`}
                              >
                                {t.verification_status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            MODULE 11: REPORTS
        ================================================================== */}
        {activeTab === 'reports' && overview && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Platform Revenue & Catalogue Analytics Reports
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Visual analytics generated from verified subject-series purchases and published
                test inventory.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Subject-Wise Active Entitlements
              </h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.subject_sales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="paper_code" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="purchases_count"
                      name="Active Entitlements"
                      fill="#1d4ed8"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            MODULE 12: SETTINGS, ADMIN CREDENTIALS & AUDIT LOGS
        ================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Administrator Settings, Credentials & Audit Trail
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Manage the official Prime Seven administrator profile, rotate your administrator
                password, verify database synchronization, and inspect platform audit logs.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Official Admin Profile Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-mono text-blue-700 font-semibold uppercase">
                      OFFICIAL PLATFORM ADMINISTRATOR
                    </p>
                    <h2 className="text-base font-bold text-slate-900 font-display mt-0.5">
                      Administrator Profile
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 text-[11px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                    {profile?.role || 'admin'}
                  </span>
                </div>

                <form onSubmit={handleSaveAdminProfile} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Administrator Display Name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={adminDisplayName}
                      onChange={(e) => setAdminDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Official Administrator Email
                    </label>
                    <input
                      type="email"
                      disabled
                      value={
                        settingsData?.official_admin?.email ||
                        profile?.email ||
                        'primeseven@gmail.com'
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-600"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-slate-500 font-mono">
                      Password Status:{' '}
                      <strong className="text-emerald-700">
                        {settingsData?.official_admin?.password_initialized
                          ? 'Hashed (scrypt + salt)'
                          : 'Pending Bootstrap'}
                      </strong>
                    </span>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>
              </div>

              {/* Change Admin Password Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <p className="text-[11px] font-mono text-blue-700 font-semibold uppercase">
                    CREDENTIAL SECURITY
                  </p>
                  <h2 className="text-base font-bold text-slate-900 font-display mt-0.5">
                    Change Administrator Password
                  </h2>
                </div>

                <form onSubmit={handleAdminPasswordSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={passwordForm.current_password}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, current_password: e.target.value })
                      }
                      placeholder="Enter current password"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        New Password (min 8 chars)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={passwordForm.new_password}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, new_password: e.target.value })
                        }
                        placeholder="Minimum 8 characters"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={passwordForm.confirm_password}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                        }
                        placeholder="Repeat new password"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={updatingPassword}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{updatingPassword ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Platform Configuration Status */}
            {settingsData && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <h2 className="text-sm font-bold text-slate-900 font-display">
                    Database & Payment Gateway Configuration
                  </h2>
                  <p className="text-slate-600 font-mono">
                    PostgreSQL Connected:{' '}
                    <strong>{settingsData.platform_config.postgres_connected ? 'Yes' : 'Local Store'}</strong>{' '}
                    · Razorpay Mode:{' '}
                    <strong className="uppercase">{settingsData.platform_config.payment_mode}</strong>{' '}
                    · Subjects: <strong>{subjects.length}</strong> · Tests:{' '}
                    <strong>{tests.length}</strong>
                  </p>
                </div>

                <button
                  onClick={handleRunDbMigrations}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-blue-700" />
                  <span>Sync PostgreSQL Schema</span>
                </button>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900 font-display">
                  Platform Audit Trail
                </h2>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Timestamp</th>
                      <th className="py-3 px-4 font-semibold">Actor</th>
                      <th className="py-3 px-4 font-semibold">Action</th>
                      <th className="py-3 px-4 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(auditData?.audit_logs || []).map((log: any) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 font-mono">{log.actor_email}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 11: MARKETING & REFERRALS */}
        {activeTab === 'marketing_referrals' && (
          <AdminMarketingReferralsModule subjects={subjects} notify={notify} />
        )}

        {/* Confirmation Dialog Modal */}
        {confirmDialog && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-slate-900 font-display">
                {confirmDialog.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const action = confirmDialog.onConfirm;
                    setConfirmDialog(null);
                    await action();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
