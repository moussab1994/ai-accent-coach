import React, { useState, useEffect, useRef } from 'react';

// Main App component
const App = () => {
    // State for the conversation history
    const [conversation, setConversation] = useState([]);
    // State for the user's current input message
    const [message, setMessage] = useState('');
    // State to manage the speech recognition (listening) status
    const [isListening, setIsListening] = useState(false);
    // State to manage the speech synthesis (speaking) status of the AI
    const [isSpeaking, setIsSpeaking] = useState(false);
    // State for loading indicator during AI response generation
    const [isLoading, setIsLoading] = useState(false);
    // State to store any error messages
    const [error, setError] = useState('');
    // State to track if the AI is expecting specific input for a feature ('vocab' or 'rephrase')
    const [awaitingFeatureInput, setAwaitingFeatureInput] = useState(null);
    // Reference to the SpeechRecognition instance
    const recognitionRef = useRef(null);
    // Reference to the SpeechSynthesisUtterance instance
    const utteranceRef = useRef(null);
    // Reference to the chat history container for auto-scrolling
    const chatHistoryRef = useRef(null);

    // Gemini API configuration
    // IMPORTANT: This is correctly set for local development with 'npm start' using process.env.
    // DO NOT CHANGE this unless instructed to run directly in Canvas.
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

    // Prompt to establish the AI's persona as a British BBC accent teacher
    const initialPrompt = "You are an AI virtual teacher focused on helping users learn and practice a British BBC accent. Your responses should be clear, concise, and use formal British English vocabulary and phrasing. When appropriate, offer specific advice on pronunciation, intonation, or common British English nuances based on the user's input. Encourage polite, clear conversation. Start by introducing yourself and asking how you can assist the user in their journey to master the British accent.";

    // Effect for initializing Speech Recognition and Speech Synthesis
    useEffect(() => {
        // Initialize SpeechRecognition
        if ('webkitSpeechRecognition' in window) {
            recognitionRef.current = new window.webkitSpeechRecognition();
            recognitionRef.current.continuous = false; // Listen for a single utterance
            recognitionRef.current.interimResults = false; // Only return final results
            recognitionRef.current.lang = 'en-GB'; // Set recognition language to British English

            // Event handler for when speech recognition results are available
            recognitionRef.current.onresult = (event) => {
                const speechResult = event.results[0][0].transcript;
                setMessage(speechResult); // Set the recognized speech as the current message
                stopListening(); // Stop listening after receiving a result
                sendMessage(speechResult); // Send the recognized speech to the AI
            };

            // Event handler for when speech recognition ends
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            // Event handler for speech recognition errors
            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setError(`Speech recognition error: ${event.error}. Please ensure microphone access is granted.`);
                setIsListening(false);
            };
        } else {
            setError("Web Speech API is not supported in this browser. Please use Chrome or Edge for voice input.");
        }

        // Initialize SpeechSynthesis
        const synth = window.speechSynthesis;
        utteranceRef.current = new SpeechSynthesisUtterance();
        utteranceRef.current.lang = 'en-GB'; // Set synthesis language to British English
        utteranceRef.current.rate = 1; // Normal speed
        utteranceRef.current.pitch = 1; // Normal pitch

        // Event handler for when speech synthesis starts
        utteranceRef.current.onstart = () => {
            setIsSpeaking(true);
        };

        // Event handler for when speech synthesis ends
        utteranceRef.current.onend = () => {
            setIsSpeaking(false);
        };

        // Event handler for speech synthesis errors
        utteranceRef.current.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            setError(`Speech synthesis error: ${event.error}`);
            setIsSpeaking(false);
        };

        // Initial greeting from the AI teacher
        setConversation([{ role: 'model', text: 'Hello! I am your AI British accent teacher. How may I assist you today in mastering the nuances of British English?' }]);

        // Cleanup function for unmounting
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (synth.speaking) {
                synth.cancel();
            }
        };
    }, []); // Empty dependency array means this effect runs once on mount

    // Effect to auto-scroll to the bottom of the chat history
    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [conversation]); // Scroll whenever conversation updates

    // Function to start speech recognition
    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            setError(''); // Clear previous errors
            try {
                recognitionRef.current.start();
                setIsListening(true);
                // Add a temporary 'Listening...' message to the conversation
                setConversation(prev => [...prev, { role: 'user', text: 'Listening...' }]);
            } catch (e) {
                console.error("Error starting speech recognition:", e);
                setError("Failed to start speech recognition. Please check microphone permissions.");
                setIsListening(false);
            }
        } else {
            setError("Speech recognition is not available or already active.");
        }
    };

    // Function to stop speech recognition
    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    // Helper function to send prompts to Gemini API
    const sendPromptToGemini = async (promptContent) => {
        setIsLoading(true); // Set loading state

        // Prepare chat history for Gemini API, including the initial prompt
        // Filter out 'listening' messages and map roles for API
        const chatHistory = [
            { role: "user", parts: [{ text: initialPrompt }] },
            ...conversation.filter(msg => msg.text !== 'Listening...' && msg.text !== '✨ I\'d like some British vocabulary/idioms.' && msg.text !== '✨ I\'d like a sentence rephrased in British English.' && msg.text !== '✨ Requested pronunciation tips for:' && msg.text !== '✨ Starting a new role-play scenario...').map(msg => ({ // Filter out feature activation messages
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            })),
            { role: "user", parts: [{ text: promptContent }] } // Add the specific prompt for this API call
        ];

        try {
            const payload = { contents: chatHistory };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            let aiResponseText = "I apologize, I couldn't generate a response at this moment. Please try again.";
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                aiResponseText = result.candidates[0].content.parts[0].text;
            } else if (result.error) {
                console.error("Gemini API error:", result.error);
                aiResponseText = `Error: ${result.error.message || "An unknown API error occurred."}`;
            }

            const aiMessage = { role: 'model', text: aiResponseText };
            setConversation(prev => [...prev, aiMessage]); // Add AI message to history
            speakMessage(aiResponseText); // Speak the AI response

        } catch (err) {
            console.error("Error communicating with Gemini API:", err);
            setError("Failed to get response from AI. Please check your network connection.");
            setConversation(prev => [...prev, { role: 'model', text: "I'm having trouble connecting right now. Please try again later." }]);
        } finally {
            setIsLoading(false); // End loading state
        }
    };

    // Function to handle sending messages (either typed or spoken)
    const sendMessage = async (textToSend = message) => {
        if (!textToSend.trim() || isLoading) {
            return; // Don't send empty messages or if loading
        }

        setError(''); // Clear previous errors
        const userMessage = { role: 'user', text: textToSend };

        // Remove the "Listening..." message if it's the last one
        setConversation(prev => {
            const updated = prev.filter(msg => msg.text !== 'Listening...');
            return [...updated, userMessage];
        });
        setMessage(''); // Clear input field

        if (awaitingFeatureInput === 'vocab') {
            const prompt = `The user is asking for British English vocabulary and idioms related to the topic: "${textToSend}". As a British BBC accent teacher, please provide a list of 5-7 relevant words or idioms with brief explanations/contexts.`;
            setAwaitingFeatureInput(null); // Reset the feature input flag
            // Add a placeholder message while AI is thinking
            setConversation(prev => [...prev, { role: 'model', text: 'Thank you. Please wait a moment while I compile some suggestions for you.' }]);
            await sendPromptToGemini(prompt);
        } else if (awaitingFeatureInput === 'rephrase') {
            const prompt = `The user wants to rephrase the sentence: "${textToSend}". As a British BBC accent teacher, please rephrase this sentence to sound more natural and idiomatic in British English. Offer one or two alternative phrasings.`;
            setAwaitingFeatureInput(null); // Reset the feature input flag
            // Add a placeholder message while AI is thinking
            setConversation(prev => [...prev, { role: 'model', text: 'Understood. Let me consider how to best rephrase that for a British context.' }]);
            await sendPromptToGemini(prompt);
        } else {
            // Normal chat flow
            await sendPromptToGemini(userMessage.text);
        }
    };

    // Function to get pronunciation tips using Gemini API
    const getPronunciationTips = async () => {
        // Find the last actual user message (not 'Listening...')
        const lastUserMessage = conversation
            .slice() // Create a shallow copy to avoid mutating state directly
            .reverse() // Reverse to find the last message quickly
            .find(msg => msg.role === 'user' && msg.text !== 'Listening...');

        if (!lastUserMessage) {
            setError("Please speak or type a message first to get pronunciation tips.");
            return;
        }

        const prompt = `The user just said: "${lastUserMessage.text}". As a British BBC accent teacher, please provide specific, helpful pronunciation tips for improving the British English sound of that sentence. Focus on key words or common phonetic differences. Keep it concise and practical.`;
        setConversation(prev => [...prev, { role: 'user', text: `✨ Requested pronunciation tips for: "${lastUserMessage.text}"` }]);
        await sendPromptToGemini(prompt);
    };

    // Function to initiate British Vocabulary/Idioms feature
    const getBritishVocabulary = async () => {
        setError('');
        setConversation(prev => [...prev, { role: 'user', text: '✨ I\'d like some British vocabulary/idioms.' }]);
        const promptText = 'Excellent! Please tell me, what topic would you like vocabulary or idioms for? For example, you could say "food," "travel," or "everyday life."';
        setConversation(prev => [...prev, { role: 'model', text: promptText }]);
        speakMessage(promptText);
        setAwaitingFeatureInput('vocab'); // Set mode to await topic
    };

    // Function to initiate Rephrase Sentence feature
    const rephraseSentence = async () => {
        setError('');
        setConversation(prev => [...prev, { role: 'user', text: '✨ I\'d like a sentence rephrased in British English.' }]);
        const promptText = 'Certainly. Please provide the sentence you wish to rephrase. I will endeavour to make it sound more quintessentially British.';
        setConversation(prev => [...prev, { role: 'model', text: promptText }]);
        speakMessage(promptText);
        setAwaitingFeatureInput('rephrase'); // Set mode to await sentence
    };

    // Function to start a role-play scenario using Gemini API
    const startRolePlay = async () => {
        const prompt = "As a British BBC accent teacher, please initiate a short, engaging role-play scenario for the user to practice their British English. Suggest a setting (e.g., a café, a train station, a British garden party) and start the conversation. Keep your initial prompt for the role-play short and set the scene clearly.";
        setConversation(prev => [...prev, { role: 'user', text: '✨ Starting a new role-play scenario...' }]);
        await sendPromptToGemini(prompt);
    };

    // Function to speak a given text message
    const speakMessage = (text) => {
        const synth = window.speechSynthesis;
        if (synth.speaking) {
            synth.cancel(); // Stop current speech if any
        }

        const voices = synth.getVoices();
        // Find a British English voice
        // Prioritize Google UK English voices if available, otherwise any en-GB
        const britishVoice = voices.find(voice => voice.name.includes('Google UK English') || voice.lang === 'en-GB');
        if (britishVoice) {
            utteranceRef.current.voice = britishVoice;
        } else {
            console.warn("British English voice not found. Using default voice.");
        }

        utteranceRef.current.text = text;
        synth.speak(utteranceRef.current);
    };

    // Function to stop the AI's current speech
    const stopSpeaking = () => {
        const synth = window.speechSynthesis;
        if (synth.speaking) {
            synth.cancel();
            setIsSpeaking(false);
        }
    };

    // Function to clear the conversation history
    const clearConversation = () => {
        setConversation([{ role: 'model', text: 'Hello! I am your AI British accent teacher. How may I assist you today in mastering the nuances of British English?' }]);
        setError('');
        setAwaitingFeatureInput(null); // Reset any awaiting feature input
        stopSpeaking();
        stopListening();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center p-4 font-sans antialiased">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl flex flex-col md:flex-row gap-6 border border-blue-200">
                {/* Left Panel: App Title and Description */}
                {/* Adjustments for responsiveness and fixed width on larger screens */}
                <div className="w-full md:w-1/3 p-4 bg-blue-50 rounded-lg shadow-inner flex flex-col justify-between flex-shrink-0">
                    <div>
                        <h1 className="text-4xl font-extrabold text-blue-800 mb-4 text-center">
                            <span className="block mb-2">🇬🇧</span>British Accent Teacher
                        </h1>
                        <p className="text-blue-700 text-lg leading-relaxed text-center">
                            Master the elegant nuances of British English pronunciation with your personal AI teacher.
                            Speak naturally, get feedback, and refine your accent through engaging conversations.
                        </p>
                    </div>
                    <div className="mt-8">
                        <p className="text-blue-600 text-sm text-center">
                            <strong className="font-semibold">How to Use:</strong><br />
                            1. Click "Start Speaking" or type your message.<br />
                            2. Grant microphone access if prompted.<br />
                            3. Converse with your AI teacher!<br />
                            (For best results, use Chrome or Edge browser)
                        </p>
                        {error && (
                            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center text-sm">
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Chat Interface */}
                {/* Adjusted height for chat window and flexible sizing */}
                <div className="w-full md:w-2/3 flex flex-col h-[90vh] md:h-[85vh] max-h-[90vh] md:max-h-[85vh]"> {/* Increased height here */}
                    {/* Chat History */}
                    <div ref={chatHistoryRef} className="flex-1 bg-gray-50 p-4 rounded-lg overflow-y-auto shadow-inner mb-4 border border-gray-200">
                        {conversation.map((msg, index) => (
                            <div key={index} className={`mb-3 p-3 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-indigo-100 ml-auto text-indigo-900 max-w-[80%]' : 'bg-blue-100 mr-auto text-blue-900 max-w-[80%]'}`}>
                                <strong className="font-semibold text-sm">{msg.role === 'user' ? 'You:' : 'Teacher:'}</strong> {msg.text}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="mb-3 p-3 rounded-lg shadow-sm bg-blue-100 mr-auto text-blue-900 max-w-[80%]">
                                <span className="animate-pulse">Teacher is thinking...</span>
                            </div>
                        )}
                    </div>

                    {/* Message Input and Controls */}
                    {/* Adjusted layout for input and buttons */}
                    <div className="flex flex-col gap-3">
                        {/* Input field and Send button in one row */}
                        <div className="flex">
                            <input
                                type="text"
                                className="flex-1 p-3 rounded-l-lg border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                                placeholder={awaitingFeatureInput === 'vocab' ? 'Enter a topic for vocabulary...' : awaitingFeatureInput === 'rephrase' ? 'Enter sentence to rephrase...' : 'Type your message here...'}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        sendMessage();
                                    }
                                }}
                                disabled={isLoading || isListening || isSpeaking}
                            />
                            <button
                                onClick={() => sendMessage()}
                                className="bg-blue-600 text-white p-3 rounded-r-lg hover:bg-blue-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!message.trim() || isLoading || isListening || isSpeaking}
                            >
                                Send
                            </button>
                        </div>
                        
                        {/* Buttons for Speaking, Tips, Role-play, Clear Chat */}
                        {/* On small screens, they will stack (col-span-2 for clear), on md and up, they'll be in 3 columns */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button
                                onClick={startListening}
                                className={`flex items-center justify-center p-3 rounded-lg font-semibold transition duration-200 ${isListening ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                disabled={isListening || isLoading || isSpeaking || awaitingFeatureInput}
                            >
                                {isListening ? (
                                    <>
                                        <svg className="animate-bounce h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 3 0 0017 8a1 1 0 10-2 0 5 5 0 01-5 5.93V15a1 1 0 102 0v-.077a2.99 3 0 01.297.023l.117.008A1 1 0 0115 16a3 3 0 11-6 0 1 1 0 01.297-.023l.117-.008A2.99 3 0 019 14.93V15a1 1 0 102 0v-.07z" clipRule="evenodd"></path></svg>
                                        Listening...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 3 0 0017 8a1 1 0 10-2 0 5 5 0 01-5 5.93V15a1 1 0 102 0v-.077a2.99 3 0 01.297.023l.117-.008A1 1 0 0115 16a3 3 0 11-6 0 1 1 0 01.297-.023l.117-.008A2.99 3 0 019 14.93V15a1 1 0 102 0v-.07z" clipRule="evenodd"></path></svg>
                                        Start Speaking
                                    </>
                                )}
                            </button>
                            <button
                                onClick={stopSpeaking}
                                className="flex items-center justify-center p-3 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!isSpeaking || isLoading}
                            >
                                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg>
                                Stop Teacher
                            </button>
                            <button
                                onClick={getPronunciationTips}
                                className="flex items-center justify-center p-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || isListening || isSpeaking || awaitingFeatureInput || conversation.filter(msg => msg.role === 'user' && msg.text !== 'Listening...').length === 0}
                            >
                                ✨ Pronunciation Tips
                            </button>
                            <button
                                onClick={getBritishVocabulary}
                                className="flex items-center justify-center p-3 rounded-lg bg-yellow-600 text-white font-semibold hover:bg-yellow-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || isListening || isSpeaking || awaitingFeatureInput}
                            >
                                ✨ British Vocab/Idioms
                            </button>
                            <button
                                onClick={rephraseSentence}
                                className="flex items-center justify-center p-3 rounded-lg bg-pink-600 text-white font-semibold hover:bg-pink-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || isListening || isSpeaking || awaitingFeatureInput}
                            >
                                ✨ Rephrase Britishly
                            </button>
                            <button
                                onClick={startRolePlay}
                                className="flex items-center justify-center p-3 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || isListening || isSpeaking || awaitingFeatureInput}
                            >
                                ✨ Start Role-play
                            </button>
                            <button
                                onClick={clearConversation}
                                className="col-span-1 md:col-span-3 flex items-center justify-center p-3 rounded-lg bg-gray-300 text-gray-800 font-semibold hover:bg-gray-400 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || isListening || isSpeaking}
                            >
                                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd"></path></svg>
                                Clear Chat
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
