// Global Variables and Constants
const TASK_STORAGE_KEY = 'smartAssistantTasks';
let tasks = [];
let currentTaskIndex = -1;
let lastMotivationTime = 0; 

// --- Helper Functions ---

/** Speaks a message using the Web Speech API in Roman Urdu/Urdu */
function speak(message) {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel(); 
        
        const utterance = new SpeechSynthesisUtterance(message);
        
        // --- Setting for Urdu Voice/Accent (Robust Search for Female Voice) ---
        const preferredLangs = ['ur-PK', 'hi-IN'];
        const voices = speechSynthesis.getVoices();
        let selectedVoice = null;
        
        // Priority 1: Search for high-quality (Google/Microsoft) Female voices
        for (const lang of preferredLangs) {
            selectedVoice = voices.find(voice => 
                voice.lang.toLowerCase().includes(lang.toLowerCase()) && 
                (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('WaveNet')) &&
                (voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('f'))
            );
            if (selectedVoice) {
                break;
            }
        }
        
        // Priority 2: If no high-quality voice is found, use the first voice for the language code
        if (!selectedVoice) {
            for (const lang of preferredLangs) {
                selectedVoice = voices.find(voice => voice.lang.toLowerCase().includes(lang.toLowerCase()));
                if (selectedVoice) {
                    break;
                }
            }
        }
        
        // Apply the best voice found, or use 'hi-IN' as a general fallback
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        } else {
             utterance.lang = 'hi-IN'; 
        }
        
        // Speech rate is kept slow (0.9) for better clarity
        utterance.rate = 0.9; 
        
        if (voices.length === 0) {
            speechSynthesis.onvoiceschanged = () => speak(message);
            return;
        }
        
        speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech Synthesis not supported in this browser.");
    }
}


/** Formats a Date object to 'HH:MM:SS AM/PM' */
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
    });
}

/** Saves tasks array to localStorage */
function saveTasks() {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
}

/** Loads tasks from localStorage and sorts them by time */
function loadTasks() {
    const storedTasks = localStorage.getItem(TASK_STORAGE_KEY);
    tasks = storedTasks ? JSON.parse(storedTasks) : [];
    sortTasks();
    renderTasks();
    updateCurrentTask();
}

/** Sorts tasks by their scheduled time */
function sortTasks() {
    tasks.sort((a, b) => {
        const timeA = new Date('2000/01/01 ' + a.time);
        const timeB = new Date('2000/01/01 ' + b.time);
        
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }

        return timeA - timeB;
    });
}

// --- Task Management Functions ---

/** Renders the task list to the UI */
function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = '';
    
    const firstPendingIndex = tasks.findIndex(t => !t.completed);
    currentTaskIndex = firstPendingIndex;

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        
        let statusClass = '';
        if (task.completed) {
            statusClass = 'task-status-done';
        } else {
            const timeDiffSec = getTimeDiffInSeconds(task.time);
            
            if (timeDiffSec !== null) {
                if (timeDiffSec < 0) {
                    statusClass = 'task-status-overdue'; 
                } else if (timeDiffSec < 5 * 60) { 
                    statusClass = 'task-status-soon'; 
                }
            }
        }

        li.className = `${statusClass} ${index === currentTaskIndex ? 'current-task' : ''}`;
        li.dataset.index = index;
        
        li.innerHTML = `
            <div>
                <strong>${task.name}</strong> 
                <span class="task-time">(${task.time.substring(0, 8)})</span>
                <span class="task-priority">| ${task.priority.toUpperCase()}</span>
            </div>
            <div class="task-actions">
                <button onclick="toggleTaskCompletion(${task.id})" class="btn-complete" title="Poora Karien">${task.completed ? 'Undo' : 'Done'}</button>
                <button onclick="deleteTask(${task.id})" class="btn-delete" title="Khatam Karien">X</button>
            </div>
        `;
        list.appendChild(li);
    });
}

/** Finds the first incomplete task and sets currentTaskIndex */
function updateCurrentTask() {
    const firstPendingIndex = tasks.findIndex(t => !t.completed);
    currentTaskIndex = firstPendingIndex;
    renderTasks();
}

/** Adds a new task from the form */
document.getElementById('add-task-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('task-name');
    const timeInput = document.getElementById('task-time');
    const prioritySelect = document.getElementById('task-priority');

    if (nameInput.value && timeInput.value) {
        let fullTime = timeInput.value;
        if (fullTime.length === 5) { 
            fullTime += ':00';
        }
        
        const tempDate = new Date(`2000/01/01 ${fullTime}`);
        const formattedTime = formatTime(tempDate);

        tasks.push({
            id: Date.now(), 
            name: nameInput.value,
            time: formattedTime,
            priority: prioritySelect.value,
            completed: false,
            delayCount: 0, 
            lastSpokenTime: 0 
        });

        nameInput.value = '';
        timeInput.value = '';
        
        saveTasks();
        loadTasks(); 
        speak(`Naya kaam daal diya gaya hai: ${tasks[tasks.length - 1].name} time ${formattedTime} par.`);
    }
});

/** Toggles task completion status by ID and announces the next task */
function toggleTaskCompletion(taskId) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        const task = tasks[taskIndex];
        const wasCompleted = task.completed;
        
        task.completed = !task.completed;
        task.delayCount = 0; 
        saveTasks();
        
        if (!wasCompleted) {
            speak(`${task.name} poora ho gaya. Bahut accha kiya!`);
        } else {
            speak(`Task ${task.name} wapas pending list mein hai.`);
        }
        
        loadTasks(); 
        
        // --- Announce the next sequential task (After marking done) ---
        if (!wasCompleted) {
            const nextTask = tasks.find(t => !t.completed); 
            if (nextTask) {
                const timeDiffSec = getTimeDiffInSeconds(nextTask.time);
                let message = `Agla kaam ${nextTask.name} hai.`;
                
                if (timeDiffSec > 0) {
                    const minutesLeft = Math.ceil(timeDiffSec / 60);
                    message += ` Ismein abhi takriban ${minutesLeft} minute baaqi hain.`;
                } else if (timeDiffSec < 0) {
                    const minutesLate = Math.ceil(Math.abs(timeDiffSec) / 60);
                    message += ` Ye kaam shuru ho chuka hai aur aap ${minutesLate} minute late hain.`;
                } else {
                     message += ` Aur iska waqt bilkul abhi hai.`;
                }
                
                speak(message);
            } else {
                speak("Aapke saare kaam poore ho chuke hain! Bahut umda!");
            }
        }
    }
}

/** Deletes a task by ID */
function deleteTask(taskId) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        const taskName = tasks[taskIndex].name;
        tasks.splice(taskIndex, 1);
        saveTasks();
        loadTasks(); 
        speak(`Kaam ${taskName} khatam kar diya gaya hai.`);
    }
}

// --- Real-Time Assistant Logic (The Core Loop) ---

/** Calculates time difference in seconds for tasks */
function getTimeDiffInSeconds(taskTime) {
    const taskTimeParts = taskTime.match(/(\d{2}):(\d{2}):(\d{2}) ([APM]{2})/);
    if (!taskTimeParts) return null;

    const now = new Date();
    const nowHours = now.getHours();
    const nowMinutes = now.getMinutes();
    const nowSeconds = now.getSeconds();

    let taskHours = parseInt(taskTimeParts[1]);
    const taskMinutes = parseInt(taskTimeParts[2]);
    const taskSeconds = parseInt(taskTimeParts[3]);
    const taskAmPm = taskTimeParts[4];

    // Convert task time to 24-hour format
    if (taskAmPm === 'PM' && taskHours !== 12) taskHours += 12;
    if (taskAmPm === 'AM' && taskHours === 12) taskHours = 0;

    const taskTotalSeconds = taskHours * 3600 + taskMinutes * 60 + taskSeconds;
    const nowTotalSeconds = nowHours * 3600 + nowMinutes * 60 + nowSeconds;
    
    return taskTotalSeconds - nowTotalSeconds;
}


/** Updates the clock and runs all real-time checks every second */
function updateClockAndAssistant() {
    const now = new Date();
    document.getElementById('digital-clock').textContent = formatTime(now); 
    const nowInSeconds = Math.floor(now.getTime() / 1000);

    if (currentTaskIndex !== -1) {
        const currentTask = tasks[currentTaskIndex];
        const timeDiffSec = getTimeDiffInSeconds(currentTask.time);

        if (timeDiffSec === null) return; 

        // This check ensures a minimum 1-second gap between utterances
        if (nowInSeconds > currentTask.lastSpokenTime) {
            
            let messageToSpeak = null;
            
            // 1. Critical Milestones (These are the only times we speak)
            
            // Start Time (0 seconds left)
            if (timeDiffSec === 0) {
                messageToSpeak = `Aapka task ${currentTask.name} start ho gaya hai!`;
            } 
            
            // 60 Seconds Before Task Start (1 Minute Alert)
            else if (timeDiffSec === 60) {
                messageToSpeak = `Aapka task ${currentTask.name} bas 1 minute mein shuru hone wala hai! Tayyar ho jaiye!`;
            }
            
            // Last 60 Seconds: Speak every 10 seconds (except at 60s)
            else if (timeDiffSec > 0 && timeDiffSec < 60 && timeDiffSec % 10 === 0) {
                messageToSpeak = `${currentTask.name} shuru honay mein sirf ${timeDiffSec} second baaqi hain.`;
            }
            
            // 1 to 5 Minutes: Speak at the start of every minute (except at 60s)
            else if (timeDiffSec > 60 && timeDiffSec <= 300 && timeDiffSec % 60 === 0) {
                const minutesLeft = timeDiffSec / 60;
                messageToSpeak = `${currentTask.name} shuru honay mein ${minutesLeft} minute baaqi hain.`;
            }
            
            // Late Reminder (Speaks exactly when 1, 2, 3... minute late)
            const secondsLate = Math.abs(timeDiffSec);
            if (timeDiffSec < 0 && secondsLate >= 60 && secondsLate % 60 < 2) {
                 messageToSpeak = `Aap ${currentTask.name} ke liye late ho chukay hain! Fauran isko poora karien!`;
                 currentTask.delayCount++; 
            }
            
            
            // Speak the message and update the spoken time
            if (messageToSpeak) {
                speak(messageToSpeak);
                currentTask.lastSpokenTime = nowInSeconds; 
                saveTasks();
            }
        }
        
        // 2. Motivational Phrases Logic (Runs randomly, independent of the critical time countdown)
        handleMotivationalPhrases(currentTask, nowInSeconds, timeDiffSec);
        
        // Re-render tasks for UI color updates (runs every second)
        renderTasks(); 
    }
}

// --- Motivational Behavior ---

const MOTIVATIONAL_PHRASES = [
    "Jaldi karien! Waqt nikal raha hai, apna kaam shuru karien.",
    "Aap schedule se peeche hain! Abhi focus karien!",
    "Har aik second qeemti hai, aagay barhiye!",
    "Bas thora sa josh, yeh kaam khatam karien."
];

/** Handles motivational phrases if the task is severely delayed or randomly */
function handleMotivationalPhrases(task, nowInSeconds, timeDiffSec) {
    const secondsLate = Math.abs(timeDiffSec);

    // --- Aggressive Delay Motivation (Only when late and delayCount is high) ---
    // Note: Delay logic ensures this only speaks if a critical alert hasn't just spoken.
    if (timeDiffSec < 0 && task.delayCount > 0 && nowInSeconds > task.lastSpokenTime + 10) {
        let interval = 0; 
        
        if (task.delayCount >= 10) { // Over 10 mins late: check every 15 seconds
            interval = 15; 
        } else if (task.delayCount >= 5) { // Over 5 mins late: check every 30 seconds
            interval = 30;
        }

        if (interval > 0 && (secondsLate % interval === 0)) {
            const urgentPhrase = MOTIVATIONAL_PHRASES[Math.floor(Math.random() * 3)]; 
            speak(`Khayal karien! ${urgentPhrase}`);
            task.lastSpokenTime = nowInSeconds;
            saveTasks();
            return; 
        }
    }
    
    // --- Random Motivation (Every 1-5 minutes check) ---
    if (nowInSeconds > lastMotivationTime + 60) {
        // 20% chance to speak every minute
        if (!task.completed && Math.random() < 0.20) {
            const randomPhrase = MOTIVATIONAL_PHRASES[Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length)];
            speak(`Aapke liye aik chota message: ${randomPhrase}`);
            lastMotivationTime = nowInSeconds;
        } else if (Math.random() < 0.20) {
             lastMotivationTime = nowInSeconds; 
        }
    }
}


// --- Initialization ---

function init() {
    // 1. Load tasks from storage
    loadTasks();
    
    // 2. Start the main interval (every 1000ms = 1 second)
    setInterval(updateClockAndAssistant, 1000);
    
    // 3. Initial clock and assistant update
    updateClockAndAssistant();
    
    // Initial greeting in Roman Urdu
    speak("Salam! Main aapka Smart Assistant hoon. Aap apna schedule shuru karien.");
}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', init);