import { GoogleGenAI } from "@google/genai";
import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant } from '../types';

const getApiKey = (): string => {
  // First try localStorage (user-configured), then fall back to env var
  return localStorage.getItem('clearmind-api-key') || process.env.API_KEY || '';
};

const getAI = (): GoogleGenAI | null => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Interface for all user context data
export interface UserContext {
  profile?: UserProfile;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  habits: Habit[];
  goals: Goal[];
  milestones: Milestone[];
  logs: LogEntry[];
  rants: Rant[];
}

// Format user context into a readable summary for the AI
const formatUserContext = (context: UserContext): string => {
  const sections: string[] = [];
  
  // Profile
  if (context.profile) {
    sections.push(`## User Profile
- Nickname: ${context.profile.nickname}
- GitHub: ${context.profile.githubUsername || 'Not set'}
- Joined: ${context.profile.joinedAt}`);
  }

  // Projects
  if (context.projects.length > 0) {
    const projectList = context.projects.map(p => 
      `- "${p.title}" (${p.status}, ${p.progress}% complete) - ${p.description}`
    ).join('\n');
    sections.push(`## Projects (${context.projects.length})
${projectList}`);
  }

  // Tasks
  if (context.tasks.length > 0) {
    const pendingTasks = context.tasks.filter(t => !t.completed);
    const completedTasks = context.tasks.filter(t => t.completed);
    const taskList = pendingTasks.slice(0, 10).map(t => 
      `- [${t.priority}] "${t.title}"${t.dueDate ? ` (due: ${t.dueDate})` : ''}`
    ).join('\n');
    sections.push(`## Tasks (${pendingTasks.length} pending, ${completedTasks.length} completed)
${taskList}${pendingTasks.length > 10 ? `\n... and ${pendingTasks.length - 10} more` : ''}`);
  }

  // Notes
  if (context.notes.length > 0) {
    const noteList = context.notes.slice(0, 5).map(n => 
      `- "${n.title}" (edited: ${n.lastEdited}) - ${n.content.substring(0, 100)}...`
    ).join('\n');
    sections.push(`## Notes (${context.notes.length} total)
${noteList}`);
  }

  // Habits
  if (context.habits.length > 0) {
    const habitList = context.habits.map(h => 
      `- "${h.name}" - ${h.streak} day streak${h.completedToday ? ' ✓ done today' : ' ○ not done today'}`
    ).join('\n');
    sections.push(`## Habits (${context.habits.length})
${habitList}`);
  }

  // Goals
  if (context.goals.length > 0) {
    const goalList = context.goals.map(g => 
      `- [${g.category}] "${g.title}" - ${g.progress}% (target: ${g.targetDate})`
    ).join('\n');
    sections.push(`## Goals (${context.goals.length})
${goalList}`);
  }

  // Milestones
  if (context.milestones.length > 0) {
    const milestoneList = context.milestones.map(m => 
      `- ${m.completed ? '✓' : '○'} "${m.title}" (${m.date}) - ${m.description}`
    ).join('\n');
    sections.push(`## Milestones (${context.milestones.length})
${milestoneList}`);
  }

  // Daily Logs (recent)
  if (context.logs.length > 0) {
    const recentLogs = context.logs.slice(-5);
    const logList = recentLogs.map(l => 
      `- ${l.date} [${l.mood}]: ${l.content.substring(0, 150)}...`
    ).join('\n');
    sections.push(`## Recent Daily Logs
${logList}`);
  }

  // Rants (recent frustrations)
  if (context.rants.length > 0) {
    const recentRants = context.rants.slice(-3);
    const rantList = recentRants.map(r => 
      `- ${r.createdAt}${r.mood ? ` [${r.mood}]` : ''}: ${r.content.substring(0, 200)}...`
    ).join('\n');
    sections.push(`## Recent Rants/Vents (for emotional context)
${rantList}`);
  }

  return sections.join('\n\n');
};

export const generateIrisResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  userContext?: UserContext
): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    return "Iris is offline. Please configure your API Key in Settings.";
  }

  // Build context-aware system instruction
  let systemInstruction = `You are Iris, the AI companion inside the productivity tool "ClearMind". 
You were created by a developer who struggled with consistency but turned it around. 
Your goal is to help the user document their journey, offer encouragement during tough times, and help break down complex tasks.
Be concise, technical but friendly, and always push for progress.

IMPORTANT: You have full access to the user's data in ClearMind. Use this context to give personalized, relevant advice.
Reference their specific projects, tasks, habits, goals, and even their rants when appropriate.
If they seem frustrated (based on rants), acknowledge it and offer support.
If they have pending high-priority tasks, gently remind them.
Celebrate their streaks and completed milestones.`;

  if (userContext) {
    const contextSummary = formatUserContext(userContext);
    if (contextSummary) {
      systemInstruction += `\n\n=== USER'S CURRENT DATA ===\n${contextSummary}\n=== END OF USER DATA ===`;
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({
          role: h.role,
          parts: h.parts
        })),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction,
      }
    });

    return response.text || "I'm thinking...";
  } catch (error) {
    console.error("Error communicating with Iris:", error);
    return "Connection to the neural link failed. Try again.";
  }
};

export const generateIRISResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    return "IRIS is offline. Please configure your API Key in Settings.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({
          role: h.role,
          parts: h.parts
        })),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction: `You are IRIS, the AI companion inside the productivity tool "ClearMind". 
        You were created by a developer who struggled with consistency but turned it around. 
        Your goal is to help the user document their journey, offer encouragement during "rant" sessions, and help break down complex software engineering tasks.
        Be concise, technical but friendly, and always push for "one more commit".`,
      }
    });

    return response.text || "I'm thinking...";
  } catch (error) {
    console.error("Error communicating with IRIS:", error);
    return "Connection to the neural link failed. Try again.";
  }
};