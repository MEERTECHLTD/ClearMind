import { GoogleGenAI } from "@google/genai";
import { Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant } from '../types';

// Global API key from environment variable (set in Vercel)
const GLOBAL_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const getApiKey = (): string => {
  // Use the global API key from environment variable
  // This removes the need for users to configure their own key
  return GLOBAL_API_KEY;
};

// Check if API is configured (for UI purposes)
export const isApiConfigured = (): boolean => {
  return !!GLOBAL_API_KEY;
};

const getAI = (): GoogleGenAI | null => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Clean AI response to remove asterisks, dashes, and markdown formatting
const cleanResponse = (text: string): string => {
  return text
    // Remove bold/italic asterisks (**, *, ***)
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // Remove any remaining standalone asterisks
    .replace(/\*/g, '')
    // Replace dash bullet points at start of lines with numbers or remove
    .replace(/^\s*[-–—]\s+/gm, '• ')
    // Replace markdown headers (##, ###) with plain text
    .replace(/^#{1,6}\s+/gm, '')
    // Clean up any double spaces
    .replace(/  +/g, ' ')
    .trim();
};

// Simple response generator for general-purpose AI requests (e.g., Mind Maps)
export const generateResponse = async (prompt: string): Promise<string> => {
  const ai = getAI();
  
  if (!ai) {
    throw new Error("AI service is not available. Please try again later.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    return response.text || "";
  } catch (error) {
    console.error("Error generating AI response:", error);
    throw new Error("Failed to generate AI response. Please try again.");
  }
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
    return "Iris is currently unavailable. The AI service is being configured. Please try again later.";
  }

  // Build context-aware system instruction
  let systemInstruction = `You are Iris, the AI companion inside the productivity tool "ClearMind". 
You were created by a developer who struggled with consistency but turned it around. 
Your goal is to help the user document their journey, offer encouragement during tough times, and help break down complex tasks.
Be concise, technical but friendly, and always push for progress.

FORMATTING RULES (VERY IMPORTANT):
- NEVER use asterisks (*) or bold/italic markdown formatting
- NEVER use dashes (-) for bullet points or lists
- Write in natural, flowing paragraphs like a human conversation
- If you need to list things, use numbered lists (1, 2, 3) or just mention them naturally in sentences
- Keep your tone warm, supportive, and conversational like talking to a friend
- Avoid robotic or formal language

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

    return cleanResponse(response.text || "I'm thinking...");
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
    return "Iris is currently unavailable. The AI service is being configured. Please try again later.";
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
        Be concise, technical but friendly, and always push for "one more commit".
        
        FORMATTING RULES (VERY IMPORTANT):
        Never use asterisks (*) or bold/italic markdown formatting.
        Never use dashes (-) for bullet points or lists.
        Write in natural, flowing paragraphs like a human conversation.
        If you need to list things, use numbered lists (1, 2, 3) or mention them naturally in sentences.
        Keep your tone warm, supportive, and conversational like talking to a friend.`,
      }
    });

    return cleanResponse(response.text || "I'm thinking...");
  } catch (error) {
    console.error("Error communicating with IRIS:", error);
    return "Connection to the neural link failed. Try again.";
  }
};