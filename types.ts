export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: 'In Progress' | 'Completed' | 'On Hold';
  progress: number;
  tags: string[];
  deadline?: string;
  // Enhanced project fields
  startDate?: string;
  projectMilestones?: ProjectMilestone[];
  reportingStructure?: string; // e.g., "Reports to: Manager Name"
  team?: string[]; // Team members
  priority?: 'High' | 'Medium' | 'Low';
  category?: string;
  notes?: string;
}

export interface LogEntry {
  id: string;
  date: string;
  content: string;
  mood: 'Productive' | 'Neutral' | 'Frustrated' | 'Flow State';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  dueTime?: string;
  taskNumber?: number;
  notified?: boolean;
  description?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  lastEdited: string;
}

export interface Habit {
  id: string;
  name: string;
  streak: number;
  completedToday: boolean;
  history: boolean[]; // Last 7 days
  monthlyHistory?: { [date: string]: boolean }; // Monthly tracking: { "2026-01-04": true }
  description?: string;
  color?: string;
  createdAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  location?: string;
  color: string;
  reminder: boolean;
  notified?: boolean;
}

export interface DailyMapperEntry {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (e.g., "05:00")
  endTime: string; // HH:MM (e.g., "05:30")
  task: string;
  completed: 'yes' | 'no' | 'partial';
  comment?: string;
  adjustment?: string;
  color?: string;
}

export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  progress: number;
  category: 'Career' | 'Personal' | 'Health' | 'Skill';
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  description: string;
}

export interface Rant {
  id: string;
  content: string;
  createdAt: string;
  mood?: 'frustrated' | 'angry' | 'overwhelmed' | 'confused';
}

export interface Application {
  id: string;
  name: string;
  link?: string;
  type: 'job' | 'grant' | 'other';
  status: 'draft' | 'open' | 'submitted' | 'closed' | 'accepted' | 'rejected';
  openingDate?: string;
  closingDate?: string;
  submissionDeadline?: string;
  submittedDate?: string;
  notes?: string;
  organization?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface IrisConversation {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface MindMapNode {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  isRoot?: boolean;
  isDecision?: boolean; // For decision tree nodes
}

export interface MindMapEdge {
  id: string;
  from: string; // Node ID
  to: string; // Node ID
  label?: string; // For decision tree labels (e.g., "Yes", "No")
}

export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  type: 'mindmap' | 'decision-tree';
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string; // usually 'current-user'
  nickname: string;
  githubUsername?: string;
  joinedAt: string;
  // Cloud user fields (optional for local-only users)
  email?: string;
  photoURL?: string;
  provider?: 'email' | 'google' | 'github' | 'anonymous' | 'local';
  cloudUserId?: string; // Firebase UID
  lastSyncedAt?: string;
}

export type ViewState = 
  | 'dashboard' 
  | 'projects' 
  | 'tasks' 
  | 'notes' 
  | 'habits' 
  | 'goals' 
  | 'milestones' 
  | 'iris' 
  | 'rant' 
  | 'dailylog' 
  | 'analytics' 
  | 'mindmap'
  | 'calendar'
  | 'dailymapper'
  | 'applications'
  | 'settings';