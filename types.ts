export interface Project {
  id: string;
  title: string;
  description: string;
  status: 'In Progress' | 'Completed' | 'On Hold';
  progress: number;
  tags: string[];
  deadline?: string;
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
  | 'settings';