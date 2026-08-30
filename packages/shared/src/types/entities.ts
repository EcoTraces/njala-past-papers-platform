import type {
  AccountStatus,
  AppRole,
  ExaminationType,
  NotificationType,
  OcrStatus,
  PaperStatus,
  PaperType,
  PracticeSessionStatus,
  ProcessingJobStatus,
  ProgrammeLevel,
  QuestionType,
  QuestionVerificationStatus,
} from '../constants/enums.js';

export interface Profile {
  id: string;
  studentId: string | null;
  staffId: string | null;
  fullName: string;
  contactEmail: string | null;
  phone: string | null;
  avatarUrl: string | null;
  programmeId: string | null;
  departmentId: string | null;
  entryYear: number | null;
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser extends Profile {
  roles: AppRole[];
}

export interface Faculty {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export interface Department {
  id: string;
  facultyId: string;
  name: string;
  code: string;
  description: string | null;
}

export interface Programme {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  level: ProgrammeLevel;
  durationYears: number;
}

export interface Course {
  id: string;
  departmentId: string;
  programmeId: string | null;
  code: string;
  title: string;
  description: string | null;
  yearLevel: number | null;
  creditUnits: number | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Semester {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface ExaminationPaper {
  id: string;
  title: string;
  courseId: string;
  facultyId: string;
  departmentId: string;
  programmeId: string | null;
  academicYearId: string;
  semesterId: string;
  examinationType: ExaminationType;
  paperType: PaperType;
  examinationDate: string | null;
  durationMinutes: number | null;
  status: PaperStatus;
  rejectionReason: string | null;
  uploadedBy: string;
  verifiedBy: string | null;
  originalFilename: string;
  fileSizeBytes: number;
  mimeType: string;
  pageCount: number | null;
  ocrStatus: OcrStatus;
  publicationDate: string | null;
  archiveDate: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  sourcePaperId: string | null;
  courseId: string;
  section: string | null;
  questionNumber: string | null;
  questionText: string;
  questionType: QuestionType;
  marks: number;
  difficulty: number | null;
  explanation: string | null;
  authorId: string;
  verificationStatus: QuestionVerificationStatus;
  verifiedBy: string | null;
  createdAt: string;
}

export interface QuestionOption {
  id: string;
  questionId: string;
  optionLabel: string;
  optionText: string;
  /** Never sent to a STUDENT-role client until after marking. */
  isCorrect?: boolean;
  orderIndex: number;
}

export interface PracticeSession {
  id: string;
  userId: string;
  courseId: string | null;
  sourcePaperId: string | null;
  title: string;
  status: PracticeSessionStatus;
  totalQuestions: number;
  totalMarks: number;
  obtainedMarks: number | null;
  percentage: number | null;
  startedAt: string;
  submittedAt: string | null;
  timeSpentSeconds: number;
}

export interface PracticeAnswer {
  id: string;
  sessionId: string;
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
  numericalAnswer: number | null;
  isCorrect: boolean | null;
  marksAwarded: number | null;
  autoMarked: boolean;
  markedBy: string | null;
}

export interface Bookmark {
  id: string;
  userId: string;
  paperId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DocumentProcessingJob {
  id: string;
  paperId: string;
  jobType: string;
  status: ProcessingJobStatus;
  attempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
