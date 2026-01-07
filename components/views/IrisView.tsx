import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateIrisResponse, UserContext, parseTaskCommands, ParsedTask } from '../../services/geminiService';
import { dbService, STORES } from '../../services/db';
import { ChatMessage, Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, Rant, IrisConversation } from '../../types';
import { Send, Sparkles, Bot, User, CheckCircle, Trash2, MessageSquare } from 'lucide-react';

const CURRENT_CONVERSATION_ID = 'current-iris-conversation';

const IrisView: React.FC = () => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [createdTasks, setCreatedTasks] = useState<string[]>([]);
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

  // Helper to get next task number
  const getNextTaskNumber = async (): Promise<number> => {
    const allTasks = await dbService.getAll<Task>(STORES.TASKS);
    const maxNumber = allTasks.reduce((max, task) => Math.max(max, task.taskNumber || 0), 0);
    return maxNumber + 1;
  };

  // Create tasks from Iris's parsed commands
  const createTasksFromIris = async (parsedTasks: ParsedTask[]) => {
    const createdTaskTitles: string[] = [];
    
    for (const parsedTask of parsedTasks) {
      const taskNumber = await getNextTaskNumber();
      const newTask: Task = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: parsedTask.title,
        completed: false,
        priority: parsedTask.priority,
        dueDate: parsedTask.dueDate,
        dueTime: parsedTask.dueTime,
        taskNumber,
        notified: false
      };
      
      await dbService.put(STORES.TASKS, newTask);
      createdTaskTitles.push(parsedTask.title);
    }
    
    if (createdTaskTitles.length > 0) {
      setCreatedTasks(createdTaskTitles);
      setTimeout(() => setCreatedTasks([]), 5000);
    }
  };

  // Fetch all user data for context
  const fetchUserContext = useCallback(async () => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants] = await Promise.all([
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Note>(STORES.NOTES),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<Milestone>(STORES.MILESTONES),
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Rant>(STORES.RANTS),
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
      });
    } catch (error) {
      console.error('Failed to fetch user context:', error);
    }
  }, []);

  // Load conversation and user context on mount
  useEffect(() => {
    loadConversation();
    fetchUserContext();
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

    try {
      // Format history for Gemini
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const responseText = await generateIrisResponse(history, userMsg.text, userContext || undefined);

      // Parse for task creation commands
      const { cleanedResponse, tasks } = parseTaskCommands(responseText);
      
      // Create any tasks that Iris requested
      if (tasks.length > 0) {
        await createTasksFromIris(tasks);
      }

      // Refresh context after each interaction (user might have asked Iris about updates)
      fetchUserContext();

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: cleanedResponse,
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

      {/* Task Created Notification */}
      {createdTasks.length > 0 && (
        <div className="mx-6 mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3 animate-fade-in">
          <CheckCircle className="text-green-500" size={20} />
          <div className="flex-1">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Task{createdTasks.length > 1 ? 's' : ''} added successfully!
            </p>
            <p className="text-xs text-green-500/70">
              {createdTasks.join(', ')}
            </p>
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