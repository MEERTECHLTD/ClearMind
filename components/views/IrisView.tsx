import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateIrisResponse, UserContext, parseActionCommands, ParsedActions } from '../../services/geminiService';
import { dbService, STORES } from '../../services/db';
import { ChatMessage, Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, CalendarEvent, Application, IrisConversation, ProjectCategory, DailyMapperEntry, DailyMapperTemplate } from '../../types';
import { Send, Sparkles, Bot, User, CheckCircle, Trash2, MessageSquare, FileText, Target, Calendar, Briefcase, Activity, Flag, BookOpen, Zap } from 'lucide-react';

const CURRENT_CONVERSATION_ID = 'current-iris-conversation';

// Track what actions were performed for notification
interface ActionsSummary {
  tasksCreated: string[];
  notesCreated: string[];
  habitsCreated: string[];
  goalsCreated: string[];
  projectsCreated: string[];
  milestonesCreated: string[];
  eventsCreated: string[];
  applicationsCreated: string[];
  logsCreated: string[];
  rantsCreated: string[];
  dailyMapperEntriesCreated: string[];
  habitsCompleted: string[];
  tasksCompleted: string[];
  dailyMapperCompleted: string[];
  dailyMapperUpdated: string[];
  // Deletion tracking
  tasksDeleted: string[];
  notesDeleted: string[];
  habitsDeleted: string[];
  goalsDeleted: string[];
  projectsDeleted: string[];
  milestonesDeleted: string[];
  eventsDeleted: string[];
  applicationsDeleted: string[];
  dailyMapperEntriesDeleted: string[];
  duplicatesRemoved: number;
}

const IrisView: React.FC = () => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [actionsSummary, setActionsSummary] = useState<ActionsSummary | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  
  const defaultMessage: ChatMessage = {
    id: 'init',
    role: 'model',
    text: "Hello. I am Iris. I'm here to help you maintain consistency and log your journey. I can also add tasks for you, just ask! What are we shipping today?",
    timestamp: new Date()
  };
  
  const [messages, setMessages] = useState<ChatMessage[]>([defaultMessage]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load conversation from storage
  const loadConversation = useCallback(async () => {
    try {
      const savedConversation = await dbService.get<IrisConversation>(STORES.IRIS_CONVERSATIONS, CURRENT_CONVERSATION_ID);
      if (savedConversation && savedConversation.messages.length > 0) {
        // Parse dates back from strings
        const messagesWithDates = savedConversation.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(messagesWithDates);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Save conversation to storage
  const saveConversation = useCallback(async (newMessages: ChatMessage[]) => {
    try {
      const conversation: IrisConversation = {
        id: CURRENT_CONVERSATION_ID,
        messages: newMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: newMessages.length > 1 ? newMessages[1]?.text?.slice(0, 50) : 'New Conversation'
      };
      await dbService.put(STORES.IRIS_CONVERSATIONS, conversation);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, []);

  // Clear conversation history
  const clearConversation = async () => {
    if (!confirm('Are you sure you want to clear the conversation history? Iris will forget everything discussed.')) return;
    
    const freshMessages = [defaultMessage];
    setMessages(freshMessages);
    await saveConversation(freshMessages);
  };

  // Helper to generate unique ID
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  // Helper to get next task number
  const getNextTaskNumber = async (): Promise<number> => {
    const allTasks = await dbService.getAll<Task>(STORES.TASKS);
    const maxNumber = allTasks.reduce((max, task) => Math.max(max, task.taskNumber || 0), 0);
    return maxNumber + 1;
  };

  // Execute all actions from Iris's response
  const executeActions = async (actions: ParsedActions): Promise<ActionsSummary> => {
    const summary: ActionsSummary = {
      tasksCreated: [],
      notesCreated: [],
      habitsCreated: [],
      goalsCreated: [],
      projectsCreated: [],
      milestonesCreated: [],
      eventsCreated: [],
      applicationsCreated: [],
      logsCreated: [],
      rantsCreated: [],
      dailyMapperEntriesCreated: [],
      habitsCompleted: [],
      tasksCompleted: [],
      dailyMapperCompleted: [],
      dailyMapperUpdated: [],
      tasksDeleted: [],
      notesDeleted: [],
      habitsDeleted: [],
      goalsDeleted: [],
      projectsDeleted: [],
      milestonesDeleted: [],
      eventsDeleted: [],
      applicationsDeleted: [],
      dailyMapperEntriesDeleted: [],
      duplicatesRemoved: 0,
    };

    // Create Tasks
    for (const task of actions.tasks) {
      const taskNumber = await getNextTaskNumber();
      const newTask: Task = {
        id: generateId(),
        title: task.title,
        completed: false,
        priority: task.priority,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        description: task.description,
        taskNumber,
        notified: false,
      };
      await dbService.put(STORES.TASKS, newTask);
      summary.tasksCreated.push(task.title);
    }

    // Create Notes
    for (const note of actions.notes) {
      const newNote: Note = {
        id: generateId(),
        title: note.title,
        content: note.content,
        tags: note.tags || [],
        lastEdited: new Date().toISOString(),
      };
      await dbService.put(STORES.NOTES, newNote);
      summary.notesCreated.push(note.title);
    }

    // Create Habits
    for (const habit of actions.habits) {
      const newHabit: Habit = {
        id: generateId(),
        name: habit.name,
        description: habit.description,
        color: habit.color || '#3b82f6',
        streak: 0,
        completedToday: false,
        history: [false, false, false, false, false, false, false],
        monthlyHistory: {},
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.HABITS, newHabit);
      summary.habitsCreated.push(habit.name);
    }

    // Create Goals
    for (const goal of actions.goals) {
      const newGoal: Goal = {
        id: generateId(),
        title: goal.title,
        category: goal.category,
        targetDate: goal.targetDate,
        progress: goal.progress || 0,
      };
      await dbService.put(STORES.GOALS, newGoal);
      summary.goalsCreated.push(goal.title);
    }

    // Create Projects
    for (const project of actions.projects) {
      const newProject: Project = {
        id: generateId(),
        title: project.title,
        description: project.description,
        status: project.status || 'In Progress',
        progress: 0,
        priority: project.priority || 'Medium',
        deadline: project.deadline,
        tags: project.tags || [],
        category: project.category as ProjectCategory,
      };
      await dbService.put(STORES.PROJECTS, newProject);
      summary.projectsCreated.push(project.title);
    }

    // Create Milestones
    for (const milestone of actions.milestones) {
      const newMilestone: Milestone = {
        id: generateId(),
        title: milestone.title,
        date: milestone.date,
        description: milestone.description,
        completed: milestone.completed || false,
      };
      await dbService.put(STORES.MILESTONES, newMilestone);
      summary.milestonesCreated.push(milestone.title);
    }

    // Create Events
    for (const event of actions.events) {
      const newEvent: CalendarEvent = {
        id: generateId(),
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        description: event.description,
        location: event.location,
        color: event.color || '#3b82f6',
        reminder: event.reminder !== false,
        notified: false,
      };
      await dbService.put(STORES.EVENTS, newEvent);
      summary.eventsCreated.push(event.title);
    }

    // Create Applications
    for (const app of actions.applications) {
      const newApplication: Application = {
        id: generateId(),
        name: app.name,
        organization: app.organization,
        type: app.type,
        status: 'open',
        link: app.link,
        submissionDeadline: app.submissionDeadline,
        openingDate: app.openingDate,
        closingDate: app.closingDate,
        priority: app.priority || 'Medium',
        notes: app.notes,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.APPLICATIONS, newApplication);
      summary.applicationsCreated.push(app.name);
    }

    // Create Daily Logs
    for (const log of actions.logs) {
      const newLog: LogEntry = {
        id: generateId(),
        date: log.date || new Date().toISOString().split('T')[0],
        content: log.content,
        mood: log.mood,
      };
      await dbService.put(STORES.LOGS, newLog);
      summary.logsCreated.push(log.content.slice(0, 30) + '...');
    }

    // Create Rants
    for (const rant of actions.rants) {
      const newRant: Rant = {
        id: generateId(),
        content: rant.content,
        mood: rant.mood,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.RANTS, newRant);
      summary.rantsCreated.push(rant.content.slice(0, 30) + '...');
    }

    // Create Daily Mapper Entries
    const today = new Date().toISOString().split('T')[0];
    for (const entry of actions.dailyMapperEntries) {
      let templateId: string | undefined;
      
      // If making permanent, create template first
      if (entry.makePermanent) {
        const newTemplate: DailyMapperTemplate = {
          id: generateId(),
          startTime: entry.startTime,
          endTime: entry.endTime,
          task: entry.task,
          color: entry.color || '#3B82F6',
          location: entry.location,
          permanentType: entry.permanentType || 'daily',
          createdAt: new Date().toISOString()
        };
        await dbService.put(STORES.DAILY_MAPPER_TEMPLATES, newTemplate);
        templateId = newTemplate.id;
      }
      
      const newEntry: DailyMapperEntry = {
        id: generateId(),
        date: entry.date || today,
        startTime: entry.startTime,
        endTime: entry.endTime,
        task: entry.task,
        completed: entry.completed || 'no',
        color: entry.color || '#3B82F6',
        location: entry.location,
        isPermanent: entry.makePermanent || false,
        permanentType: entry.makePermanent ? entry.permanentType : undefined,
        templateId,
      };
      await dbService.put(STORES.DAILY_MAPPER, newEntry);
      summary.dailyMapperEntriesCreated.push(entry.task);
    }

    // Update Daily Mapper Entries
    const allDailyMapperEntries = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    for (const update of actions.dailyMapperUpdates) {
      const dateToFind = update.date || today;
      const entry = allDailyMapperEntries.find(
        e => e.task.toLowerCase() === update.task.toLowerCase() && e.date === dateToFind
      );
      if (entry) {
        const updatedEntry: DailyMapperEntry = {
          ...entry,
          completed: update.completed || entry.completed,
          comment: update.comment || entry.comment,
        };
        await dbService.put(STORES.DAILY_MAPPER, updatedEntry);
        summary.dailyMapperUpdated.push(entry.task);
      }
    }

    // Complete Daily Mapper Tasks (quick complete)
    for (const taskName of actions.completedDailyMapperTasks) {
      const entry = allDailyMapperEntries.find(
        e => e.task.toLowerCase() === taskName.toLowerCase() && e.date === today && e.completed !== 'yes'
      );
      if (entry) {
        const updatedEntry: DailyMapperEntry = { ...entry, completed: 'yes' };
        await dbService.put(STORES.DAILY_MAPPER, updatedEntry);
        summary.dailyMapperCompleted.push(entry.task);
      }
    }

    // Complete Habits
    const allHabits = await dbService.getAll<Habit>(STORES.HABITS);
    for (const habitName of actions.completedHabits) {
      const habit = allHabits.find(h => h.name.toLowerCase() === habitName.toLowerCase());
      if (habit && !habit.completedToday) {
        const today = new Date().toISOString().split('T')[0];
        const updatedHabit: Habit = {
          ...habit,
          completedToday: true,
          streak: habit.streak + 1,
          history: [true, ...habit.history.slice(0, 6)],
          monthlyHistory: { ...habit.monthlyHistory, [today]: true },
        };
        await dbService.put(STORES.HABITS, updatedHabit);
        summary.habitsCompleted.push(habit.name);
      }
    }

    // Complete Tasks
    const allTasks = await dbService.getAll<Task>(STORES.TASKS);
    for (const taskTitle of actions.completedTasks) {
      const task = allTasks.find(t => t.title.toLowerCase() === taskTitle.toLowerCase() && !t.completed);
      if (task) {
        const updatedTask: Task = { ...task, completed: true };
        await dbService.put(STORES.TASKS, updatedTask);
        summary.tasksCompleted.push(task.title);
      }
    }

    // Delete Tasks
    for (const taskTitle of actions.deletedTasks) {
      const task = allTasks.find(t => t.title.toLowerCase() === taskTitle.toLowerCase());
      if (task) {
        await dbService.delete(STORES.TASKS, task.id);
        summary.tasksDeleted.push(task.title);
      }
    }

    // Delete Notes
    const allNotes = await dbService.getAll<Note>(STORES.NOTES);
    for (const noteTitle of actions.deletedNotes) {
      const note = allNotes.find(n => n.title.toLowerCase() === noteTitle.toLowerCase());
      if (note) {
        await dbService.delete(STORES.NOTES, note.id);
        summary.notesDeleted.push(note.title);
      }
    }

    // Delete Habits
    for (const habitName of actions.deletedHabits) {
      const habit = allHabits.find(h => h.name.toLowerCase() === habitName.toLowerCase());
      if (habit) {
        await dbService.delete(STORES.HABITS, habit.id);
        summary.habitsDeleted.push(habit.name);
      }
    }

    // Delete Goals
    const allGoals = await dbService.getAll<Goal>(STORES.GOALS);
    for (const goalTitle of actions.deletedGoals) {
      const goal = allGoals.find(g => g.title.toLowerCase() === goalTitle.toLowerCase());
      if (goal) {
        await dbService.delete(STORES.GOALS, goal.id);
        summary.goalsDeleted.push(goal.title);
      }
    }

    // Delete Projects
    const allProjects = await dbService.getAll<Project>(STORES.PROJECTS);
    for (const projectTitle of actions.deletedProjects) {
      const project = allProjects.find(p => p.title.toLowerCase() === projectTitle.toLowerCase());
      if (project) {
        await dbService.delete(STORES.PROJECTS, project.id);
        summary.projectsDeleted.push(project.title);
      }
    }

    // Delete Milestones
    const allMilestones = await dbService.getAll<Milestone>(STORES.MILESTONES);
    for (const milestoneTitle of actions.deletedMilestones) {
      const milestone = allMilestones.find(m => m.title.toLowerCase() === milestoneTitle.toLowerCase());
      if (milestone) {
        await dbService.delete(STORES.MILESTONES, milestone.id);
        summary.milestonesDeleted.push(milestone.title);
      }
    }

    // Delete Events
    const allEvents = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
    for (const eventTitle of actions.deletedEvents) {
      const event = allEvents.find(e => e.title.toLowerCase() === eventTitle.toLowerCase());
      if (event) {
        await dbService.delete(STORES.EVENTS, event.id);
        summary.eventsDeleted.push(event.title);
      }
    }

    // Delete Applications
    const allApplications = await dbService.getAll<Application>(STORES.APPLICATIONS);
    for (const appName of actions.deletedApplications) {
      const app = allApplications.find(a => a.name.toLowerCase() === appName.toLowerCase());
      if (app) {
        await dbService.delete(STORES.APPLICATIONS, app.id);
        summary.applicationsDeleted.push(app.name);
      }
    }

    // Delete Daily Mapper Entries
    const allDailyMapperEntries = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    for (const taskName of actions.deletedDailyMapperEntries) {
      const entries = allDailyMapperEntries.filter(e => e.task.toLowerCase() === taskName.toLowerCase());
      for (const entry of entries) {
        await dbService.delete(STORES.DAILY_MAPPER, entry.id);
        summary.dailyMapperEntriesDeleted.push(entry.task);
      }
    }

    // Delete Duplicate Daily Mapper Entries
    if (actions.deleteDuplicateDailyMapper) {
      // Group entries by date + startTime + endTime + task
      const entryGroups = new Map<string, DailyMapperEntry[]>();
      for (const entry of allDailyMapperEntries) {
        const key = `${entry.date}-${entry.startTime}-${entry.endTime}-${entry.task}`;
        if (!entryGroups.has(key)) {
          entryGroups.set(key, []);
        }
        entryGroups.get(key)!.push(entry);
      }

      // Delete duplicates (keep the first one of each group)
      for (const [, entries] of entryGroups) {
        if (entries.length > 1) {
          // Keep the first entry, delete the rest
          for (let i = 1; i < entries.length; i++) {
            await dbService.delete(STORES.DAILY_MAPPER, entries[i].id);
            summary.duplicatesRemoved++;
          }
        }
      }
    }

    return summary;
  };

  // Check if any actions were performed
  const hasAnyActions = (summary: ActionsSummary): boolean => {
    return (
      summary.tasksCreated.length > 0 ||
      summary.notesCreated.length > 0 ||
      summary.habitsCreated.length > 0 ||
      summary.goalsCreated.length > 0 ||
      summary.projectsCreated.length > 0 ||
      summary.milestonesCreated.length > 0 ||
      summary.eventsCreated.length > 0 ||
      summary.applicationsCreated.length > 0 ||
      summary.logsCreated.length > 0 ||
      summary.rantsCreated.length > 0 ||
      summary.dailyMapperEntriesCreated.length > 0 ||
      summary.habitsCompleted.length > 0 ||
      summary.tasksCompleted.length > 0 ||
      summary.dailyMapperCompleted.length > 0 ||
      summary.dailyMapperUpdated.length > 0 ||
      summary.tasksDeleted.length > 0 ||
      summary.notesDeleted.length > 0 ||
      summary.habitsDeleted.length > 0 ||
      summary.goalsDeleted.length > 0 ||
      summary.projectsDeleted.length > 0 ||
      summary.milestonesDeleted.length > 0 ||
      summary.eventsDeleted.length > 0 ||
      summary.applicationsDeleted.length > 0 ||
      summary.dailyMapperEntriesDeleted.length > 0 ||
      summary.duplicatesRemoved > 0
    );
  };

  // Fetch all user data for context
  const fetchUserContext = useCallback(async () => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications, dailyMapperEntries, dailyMapperTemplates] = await Promise.all([
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Note>(STORES.NOTES),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<Milestone>(STORES.MILESTONES),
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Rant>(STORES.RANTS),
        dbService.getAll<CalendarEvent>(STORES.EVENTS),
        dbService.getAll<Application>(STORES.APPLICATIONS),
        dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER),
        dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES),
      ]);
      
      let profile: UserProfile | undefined;
      try {
        profile = await dbService.get<UserProfile>(STORES.PROFILE, 'user');
      } catch {
        profile = undefined;
      }

      setUserContext({
        profile,
        projects,
        tasks,
        notes,
        habits,
        goals,
        milestones,
        logs,
        rants,
        events,
        applications,
        dailyMapperEntries,
        dailyMapperTemplates,
      });
    } catch (error) {
      console.error('Failed to fetch user context:', error);
    }
  }, []);

  // Load conversation and user context on mount
  useEffect(() => {
    loadConversation();
    fetchUserContext();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'iris_conversations') {
        loadConversation();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, [loadConversation, fetchUserContext]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setActionsSummary(null);

    try {
      // Format history for Gemini
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const responseText = await generateIrisResponse(history, userMsg.text, userContext || undefined);

      // Parse for all action commands
      const actions = parseActionCommands(responseText);
      
      // Execute all actions that Iris requested
      const summary = await executeActions(actions);
      
      // Show notification if any actions were performed
      if (hasAnyActions(summary)) {
        setActionsSummary(summary);
        setTimeout(() => setActionsSummary(null), 8000);
      }

      // Refresh context after each interaction
      fetchUserContext();

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: actions.cleanedResponse,
        timestamp: new Date()
      };
      
      // Update messages and save to storage
      setMessages(prev => {
        const newMessages = [...prev, userMsg, aiMsg];
        saveConversation(newMessages);
        return newMessages;
      });
    } catch (error) {
      console.error(error);
      // Still save the user message even if AI fails
      setMessages(prev => {
        const newMessages = [...prev];
        saveConversation(newMessages);
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-midnight transition-colors duration-300">
      {/* Header Area */}
      <div className="p-6 border-b dark:border-gray-800 border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
             <Sparkles className="text-purple-500" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold dark:text-white text-gray-900">Iris</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Your AI co-pilot for the journey.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <MessageSquare size={12} />
            {messages.length - 1} messages
          </span>
          <button
            onClick={clearConversation}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Clear conversation history"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Actions Performed Notification */}
      {actionsSummary && hasAnyActions(actionsSummary) && (
        <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-xl animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-green-500" size={18} />
            <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
              Iris performed actions:
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {actionsSummary.tasksCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-blue-400">
                <CheckCircle size={12} />
                <span>{actionsSummary.tasksCreated.length} task(s) created</span>
              </div>
            )}
            {actionsSummary.notesCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-yellow-400">
                <FileText size={12} />
                <span>{actionsSummary.notesCreated.length} note(s) saved</span>
              </div>
            )}
            {actionsSummary.habitsCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-purple-400">
                <Activity size={12} />
                <span>{actionsSummary.habitsCreated.length} habit(s) added</span>
              </div>
            )}
            {actionsSummary.goalsCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-orange-400">
                <Target size={12} />
                <span>{actionsSummary.goalsCreated.length} goal(s) set</span>
              </div>
            )}
            {actionsSummary.projectsCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-cyan-400">
                <BookOpen size={12} />
                <span>{actionsSummary.projectsCreated.length} project(s) created</span>
              </div>
            )}
            {actionsSummary.milestonesCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-pink-400">
                <Flag size={12} />
                <span>{actionsSummary.milestonesCreated.length} milestone(s) added</span>
              </div>
            )}
            {actionsSummary.eventsCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-green-400">
                <Calendar size={12} />
                <span>{actionsSummary.eventsCreated.length} event(s) scheduled</span>
              </div>
            )}
            {actionsSummary.applicationsCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-indigo-400">
                <Briefcase size={12} />
                <span>{actionsSummary.applicationsCreated.length} application(s) tracked</span>
              </div>
            )}
            {actionsSummary.habitsCompleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle size={12} />
                <span>{actionsSummary.habitsCompleted.length} habit(s) completed</span>
              </div>
            )}
            {actionsSummary.tasksCompleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-teal-400">
                <CheckCircle size={12} />
                <span>{actionsSummary.tasksCompleted.length} task(s) completed</span>
              </div>
            )}
            {actionsSummary.dailyMapperEntriesCreated.length > 0 && (
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Calendar size={12} />
                <span>{actionsSummary.dailyMapperEntriesCreated.length} time block(s) added</span>
              </div>
            )}
            {actionsSummary.dailyMapperCompleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-lime-400">
                <CheckCircle size={12} />
                <span>{actionsSummary.dailyMapperCompleted.length} time block(s) completed</span>
              </div>
            )}
            {actionsSummary.dailyMapperUpdated.length > 0 && (
              <div className="flex items-center gap-1.5 text-sky-400">
                <CheckCircle size={12} />
                <span>{actionsSummary.dailyMapperUpdated.length} time block(s) updated</span>
              </div>
            )}
            {actionsSummary.tasksDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.tasksDeleted.length} task(s) deleted</span>
              </div>
            )}
            {actionsSummary.notesDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.notesDeleted.length} note(s) deleted</span>
              </div>
            )}
            {actionsSummary.habitsDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.habitsDeleted.length} habit(s) deleted</span>
              </div>
            )}
            {actionsSummary.goalsDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.goalsDeleted.length} goal(s) deleted</span>
              </div>
            )}
            {actionsSummary.projectsDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.projectsDeleted.length} project(s) deleted</span>
              </div>
            )}
            {actionsSummary.milestonesDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.milestonesDeleted.length} milestone(s) deleted</span>
              </div>
            )}
            {actionsSummary.eventsDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.eventsDeleted.length} event(s) deleted</span>
              </div>
            )}
            {actionsSummary.applicationsDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.applicationsDeleted.length} application(s) deleted</span>
              </div>
            )}
            {actionsSummary.dailyMapperEntriesDeleted.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <Trash2 size={12} />
                <span>{actionsSummary.dailyMapperEntriesDeleted.length} daily mapper entry(s) deleted</span>
              </div>
            )}
            {actionsSummary.duplicatesRemoved > 0 && (
              <div className="flex items-center gap-1.5 text-orange-400">
                <Trash2 size={12} />
                <span>{actionsSummary.duplicatesRemoved} duplicate(s) removed</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoadingConversation ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-gray-500">Loading conversation...</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border
              ${msg.role === 'model' 
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-800' 
                : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800'}`}>
              {msg.role === 'model' ? <Bot size={16} /> : <User size={16} />}
            </div>
            
            <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm
              ${msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white dark:bg-midnight-light border dark:border-gray-800 border-gray-200 text-gray-800 dark:text-gray-200 rounded-tl-none'
              }`}>
              {msg.text}
            </div>
          </div>
        ))
        )}
        {isTyping && (
           <div className="flex gap-4">
             <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center">
               <Bot size={16} />
             </div>
             <div className="bg-white dark:bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
               <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
               <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-100"></div>
               <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-200"></div>
             </div>
           </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 border-t dark:border-gray-800 border-gray-200 bg-midnight transition-colors duration-300">
        <div className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask Iris for guidance or document a thought..."
            className="w-full bg-midnight-light border dark:border-gray-700 border-gray-300 dark:text-white text-gray-900 rounded-xl pl-6 pr-14 py-4 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-sm"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            title="Send message"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-500 dark:text-gray-600 mt-3">Iris helps you stay consistent. AI responses can vary.</p>
      </div>
    </div>
  );
};

export default IrisView;