// src/components/Chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chatbot.css';
import ReactMarkdown from 'react-markdown';

const ALL_SUGGESTIONS = [
  "Any good serums for my skin?",
  "How do I use this product?",
  "What are the best hair care routines?",
  "What are your store hours?",
  "How can I order?",
  "What are your delivery options?",
  "What are the best moisturizers for dry skin?",
  "How do I layer my skincare products?",
  "What are the top sunscreens you recommend?",
  "Do you have products for sensitive skin?",
  "What are the best shampoos for hair growth?",
  "How do I treat hyperpigmentation?",
  "What are the benefits of vitamin C serum?",
  "How do I build a simple skincare routine?",
  "What are the best products for oily skin?",
  "How do I prevent hair breakage?",
  "What are your bestsellers?",
  "What are the best products for sensitive skin?",
  "What are the best products for men?",
  "How do I use a face mask properly?",
  "What are the best products for scalp care?",
  "How do I choose the right cleanser?",
  "What are the best leave-in conditioners?",
  "How do I reduce frizz in my hair?",
  "What are the best products for glowing skin?",
  "How do I use a toner?",
  "What are the best products for men?",
  "How do I care for natural hair?",
  "What are the best anti-aging products?",
  "How do I treat dandruff?",
  "What are your return policies?"
];

function getRandomSuggestions() {
  const arr = [...ALL_SUGGESTIONS];
  const picked = [];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * arr.length);
    picked.push(arr.splice(idx, 1)[0]);
  }
  return picked;
}

export default function Chatbot() {
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chat_messages');
    return saved
      ? JSON.parse(saved)
      : [];
  });
  const [suggestions, setSuggestions] = useState(getRandomSuggestions());
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [conversationHistory, setConversationHistory] = useState(() => {
    const saved = localStorage.getItem('conversation_history');
    return saved ? JSON.parse(saved) : [];
  });
  const bubbleTimeoutRef = useRef(null);
  const endRef = useRef(null);
  const MIN_THINKING_TIME = 2000; // ms
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const chatWidgetRef = useRef(null);
  const [cartMessageShown, setCartMessageShown] = useState(false);
  const [whatsAppTimeout, setWhatsAppTimeout] = useState(null);
  const [isDark, setIsDark] = useState(() => document.body.classList.contains('dark-mode'));
  const [nameAskedBefore, setNameAskedBefore] = useState(() => {
    return localStorage.getItem('name_asked_before') === 'true';
  });
  const [bubbleText, setBubbleText] = useState('Ask MamaTega');
  const [cartTimeout, setCartTimeout] = useState(null);
  const [isExciting, setIsExciting] = useState(false);
  const [inactivityTimeout, setInactivityTimeout] = useState(null);
  // Keep isDark in sync with <body> class
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.body.classList.contains('dark-mode'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Set initial state
    setIsDark(document.body.classList.contains('dark-mode'));
    return () => observer.disconnect();
  }, []);
  // Remove userName state and all logic related to asking for or displaying the user's name

  // Make the chatbot as tall as possible on desktop: set desktop height to 90vh
  const isMobile = window.innerWidth <= 600;
  const containerStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', width: '100vw', maxWidth: '100vw', height: '100vh', maxHeight: '100vh', position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }
    : { display: 'flex', flexDirection: 'column', width: '400px', height: '90vh', position: 'fixed', bottom: 0, right: 0, zIndex: 9999 };

  // Improved toggleDarkMode to always sync with isDark
  const toggleDarkMode = () => {
    const willBeDark = !isDark;
    setIsDark(willBeDark);
    if (willBeDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  // Hide bubble after 5s, reappear after 20s
  useEffect(() => {
    if (!bubbleVisible) {
      bubbleTimeoutRef.current = setTimeout(() => setBubbleVisible(true), 20000);
    }
    return () => clearTimeout(bubbleTimeoutRef.current);
  }, [bubbleVisible]);

  // Hide bubble when widget is open, show when minimized
  useEffect(() => {
    if (!minimized) {
      setBubbleVisible(false);
    } else {
      // Show bubble immediately when minimized
      setBubbleVisible(true);
    }
  }, [minimized]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Scroll to bottom when chat is opened
  useEffect(() => {
    if (!minimized) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      
      // Set up initial inactivity timeout when chat opens
      const initialInactivityTimer = setTimeout(() => {
        sendInactivityPrompt();
      }, 2 * 60 * 1000); // 2 minutes
      
      setInactivityTimeout(initialInactivityTimer);
    }
  }, [minimized]);

  // Close dropdown when clicking outside the chat widget
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chatWidgetRef.current && !chatWidgetRef.current.contains(event.target)) {
        setShowConversationMenu(false);
      }
    };

    if (showConversationMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showConversationMenu]);

  // Save conversationHistory to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conversation_history', JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  useEffect(() => {
    if (!minimized) {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const itemIds = (cart.items || []).map(item => item.id).sort();
          const lastCartIds = JSON.parse(localStorage.getItem('last_cart_ids') || '[]');
          const isNewCart = JSON.stringify(itemIds) !== JSON.stringify(lastCartIds);
          
          // Update bubble text based on cart activity
          updateBubbleText(cart.items || []);
          
          if (cart.items && cart.items.length > 0 && isNewCart) {
            const itemNames = cart.items.map(item => item.product_title);
            const itemUrls = cart.items.map(item => item.url);
            const itemQuantities = cart.items.map(item => item.quantity);
            const numberedItems = itemNames.map((item, index) => `${index + 1}. [${item}](${itemUrls[index]}) (Qty: ${itemQuantities[index]})`).join('\n');
            
            // Create WhatsApp and Instagram messages with cart items
            const whatsappMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => `${index + 1}. ${item} (Qty: ${itemQuantities[index]})`).join('\n')}\n\nCan you help me with these products?`;
            const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
            const instagramLink = `https://www.instagram.com/direct/t/mamategacosmeticsandspa/`;
            
            // Array of varied cart messages with links and both WhatsApp & Instagram options
            const cartMessages = [
              `Hmm, you have excellent taste! I can see you've selected:\n\n${numberedItems}\n\nDo you have any questions about these items or would you like to know about product availability?\n\nNeed personalized assistance? [Chat on WhatsApp](${whatsappLink}) or [Message on Instagram](${instagramLink})\n\n*Note: Prices and product availability may change frequently as they are dynamic.*`,
              `Great selection! Here's what I found in your cart:\n\n${numberedItems}\n\nWould you like me to check if any of these are running low in stock?\n\nNeed more help? [Connect on WhatsApp](${whatsappLink}) or [DM on Instagram](${instagramLink})\n\n*Note: Prices and product availability may change frequently as they are dynamic.*`,
              `Nice picks! Your cart contains:\n\n${numberedItems}\n\nAny specific questions about these products or need help with anything else?\n\nFor personalized support: [WhatsApp](${whatsappLink}) | [Instagram DM](${instagramLink})\n\n*Note: Prices and product availability may change frequently as they are dynamic.*`,
              `I see you've chosen some quality items:\n\n${numberedItems}\n\nWould you like to know more about any of these or check their availability?\n\nWant expert advice? [Message on WhatsApp](${whatsappLink}) or [Instagram](${instagramLink})\n\n*Note: Prices and product availability may change frequently as they are dynamic.*`,
              `Fantastic choices! Here's what you have:\n\n${numberedItems}\n\nNeed any information about these products or want to explore similar items?\n\nFor detailed guidance: [WhatsApp](${whatsappLink}) | [Instagram](${instagramLink})\n\n*Note: Prices and product availability may change frequently as they are dynamic.*`
            ];
            
            // Pick a random message
            const randomMessage = cartMessages[Math.floor(Math.random() * cartMessages.length)];
            
            setMessages(m => [
              ...m,
              {
                type: 'bot',
                text: randomMessage,
                time: timeStamp(),
                isCartMessage: true,
                cartItems: cart.items,
                whatsappLink: whatsappLink
              }
            ]);
            localStorage.setItem('last_cart_ids', JSON.stringify(itemIds));
          }
        })
        .catch(() => {});
    }
  }, [minimized]);

  // Monitor cart changes for bubble text updates (even when minimized)
  useEffect(() => {
    const checkCart = () => {
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          updateBubbleText(cart.items || []);
        })
        .catch(() => {
          // If cart fetch fails, assume empty cart
          updateBubbleText([]);
        });
    };

    // Check cart immediately
    checkCart();

    // Set up interval to check cart every 30 seconds
    const interval = setInterval(checkCart, 30000);

    return () => clearInterval(interval);
  }, []);

  const timeStamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // On new chat, if no name is stored, have the bot send the name prompt as the first message
  // Remove the useEffect that prompts for the user's name

  // Remove the useEffect that stores the user's name

  const handleKey = e => e.key === 'Enter' && sendMessage();

  const clearChat = () => {
    // Save current conversation to history before clearing
    if (messages.length > 1) {
      const conversation = {
        id: Date.now(),
        title: messages[1]?.text?.substring(0, 30) + '...' || 'Conversation',
        messages: [...messages],
        timestamp: new Date().toISOString()
      };
      setConversationHistory(prev => [conversation, ...prev.slice(0, 9)]); // Keep last 10 conversations
    }
    localStorage.removeItem('chat_messages');
    setSessionId(null);
    setMessages([{
      type: 'bot',
      text: "I'm your MamaTega Assistant. How can I help you today?",
      time: timeStamp()
    }]);
    setSuggestions(getRandomSuggestions());
    setSelectedSuggestion(null);
    setShowConversationMenu(false);
    // Reset name asked flag for new conversation
    setNameAskedBefore(false);
    localStorage.removeItem('name_asked_before');
    // Remove the user label from user message bubbles
  };

  const loadConversation = (conversation) => {
    setMessages(conversation.messages);
    setSessionId(null);
    setShowConversationMenu(false);
  };

  // When clearing all history, also clear the name
  const clearAllHistory = () => {
    setConversationHistory([]);
    setShowConversationMenu(false);
    // Remove the user label from user message bubbles
    localStorage.removeItem('chat_user_name');
  };

  const handleCloseWidget = () => {
    setMinimized(true);
    setBubbleVisible(true);
    setShowConversationMenu(false);
  };

  // Function to handle WhatsApp connection
  const connectToWhatsApp = (message = '') => {
    const defaultMessage = 'Hi MamaTega! I need help with my order.';
    const whatsappMessage = message || defaultMessage;
    const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappLink, '_blank');
  };

  // Function to handle Instagram DM connection
  const connectToInstagram = (message = '') => {
    const defaultMessage = 'Hi MamaTega! I need help with my order.';
    const instagramMessage = message || defaultMessage;
    // Instagram DM URL format: https://www.instagram.com/direct/t/username/
    const instagramLink = `https://www.instagram.com/direct/t/mamategacosmeticsandspa/`;
    window.open(instagramLink, '_blank');
  };

  // Function to update bubble text based on cart activity
  const updateBubbleText = (cartItems) => {
    if (cartItems.length === 0) {
      setBubbleText('Ask MamaTega');
      setIsExciting(false);
      return;
    }
    
    // Fun attention-grabbing messages for cart items
    const funMessages = [
      'Helllllllloooooo! 👋',
      'Click Me! 💫',
      'Yassss! ✨',
      'Love It! 💖',
      'Perfect Pick! 🎯',
      'You Got This! 🔥',
      'Stunning! 💎',
      'Fabulous! 🦋',
      'Gorgeous! 🌸',
      'Incredible! 🚀',
      'Brilliant! 💫',
      'Stellar! ⭐',
      'Epic! 🏆',
      'Legendary! 👑',
      'Phenomenal! 🌈',
      'Outstanding! 🎨',
      'Spectacular! 🎭',
      'Hmm, you have good taste! 👌',
      'You are surely picking the right items! 🎯',
      'I see you know what you want! 💫'
    ];
    
    // Pick a random fun message
    const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
    
    setBubbleText(randomMessage);
    setIsExciting(true);
    
    // Reset timeout for 3 minutes
    if (cartTimeout) {
      clearTimeout(cartTimeout);
    }
    
    const timeout = setTimeout(() => {
      setBubbleText('Ask MamaTega');
      setIsExciting(false);
    }, 3 * 60 * 1000); // 3 minutes
    
    setCartTimeout(timeout);
  };

  // Function to send inactivity prompts
  const sendInactivityPrompt = () => {
    const inactivityPrompts = [
      "Ask me any question about products! Like 'Does this work for my skin?' or 'Is this foundation good?' 💁‍♀️",
      "Need help choosing? Try asking 'What's good for acne?' or 'Which moisturizer is best?' ✨",
      "Curious about a product? Ask me 'Does this serum work?' or 'Is this cleanser gentle?' 🤔",
      "Want recommendations? Try 'What's good for dry skin?' or 'Which sunscreen is best?' 🌟",
      "Have questions? Ask 'Does this help with wrinkles?' or 'Is this good for sensitive skin?' 💫",
      "Need advice? Try 'What's good for oily skin?' or 'Which toner should I use?' 💎",
      "Wondering about products? Ask 'Does this help with dark spots?' or 'Is this good for combination skin?' ✨",
      "Looking for help? Try 'What's good for mature skin?' or 'Which mask is best?' 🌸",
      "Need guidance? Ask 'Does this help with redness?' or 'Is this good for normal skin?' 💖",
      "Want suggestions? Try 'What's good for blemishes?' or 'Which eye cream works?' 🎯"
    ];
    
    const randomPrompt = inactivityPrompts[Math.floor(Math.random() * inactivityPrompts.length)];
    
    setMessages(m => [
      ...m,
      {
        type: 'bot',
        text: randomPrompt,
        time: timeStamp(),
        isInactivityPrompt: true
      }
    ]);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (cartTimeout) {
        clearTimeout(cartTimeout);
      }
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }
    };
  }, [cartTimeout, inactivityTimeout]);

  // Function to handle shopping completion flow
  const handleShoppingComplete = () => {
    // Get current cart items for WhatsApp message
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        const cartItems = cart.items || [];
        const itemDetails = cartItems.map(item => 
          `${item.quantity}x ${item.product_title} - $${(item.final_price / 100).toFixed(2)}`
        ).join('\n');
        const totalPrice = (cart.total_price / 100).toFixed(2);
        
        const whatsappMessage = `Hi MamaTega! I'd like to complete my order:\n\n${itemDetails}\n\nTotal: $${totalPrice}\n\nCan you help me process this order?`;
        const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
        const instagramLink = `https://www.instagram.com/direct/t/mamategacosmeticsandspa/`;
        
        const orderOptions = `Great! How would you like to complete your order?\n\n**Choose your preferred method:**\n\n🛒 **[Visit Store](javascript:void(0))** - Come shop directly at our location\n📱 **[Order via WhatsApp](${whatsappLink})** - Complete order with payment\n📸 **[Message on Instagram](${instagramLink})** - Order via Instagram DM\n\n**Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n\n*Note: Prices and product availability may change frequently as they are dynamic.*\n\nClick any link above to proceed!`;
        
        setMessages(m => [
          ...m,
          {
            type: 'bot',
            text: orderOptions,
            time: timeStamp(),
            isOrderOptions: true,
            cartItems: cartItems,
            whatsappLink: whatsappLink,
            instagramLink: instagramLink
          }
        ]);
      })
      .catch(() => {
        // Fallback if cart fetch fails
        const orderOptions = `Great! How would you like to complete your order?\n\n**Choose your preferred method:**\n\n🛒 **[Visit Store](javascript:void(0))** - Come shop directly at our location\n📱 **[Order via WhatsApp](https://wa.me/2348189880899)** - Complete order with payment\n📸 **[Message on Instagram](https://www.instagram.com/direct/t/mamategacosmeticsandspa/)** - Order via Instagram DM\n\n**Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n\n*Note: Prices and product availability may change frequently as they are dynamic.*\n\nClick any link above to proceed!`;
        
        setMessages(m => [
          ...m,
          {
            type: 'bot',
            text: orderOptions,
            time: timeStamp(),
            isOrderOptions: true
          }
        ]);
      });
  };

  const sendMessage = async (preset) => {
    const prompt = (preset !== undefined ? preset : input).trim();
    if (!prompt) return;

    // Clear inactivity timeout when user sends a message
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
    }

    // 1) Add user bubble
    setMessages(m => [...m, { type: 'user', text: prompt, time: timeStamp() }]);
    setInput('');
    setLoading(true);
    setSelectedSuggestion(null); // Reset selection after sending

    // 2) Show typing indicator
    const typingMsg = { type: 'bot', isTyping: true };
    setMessages(m => [...m, typingMsg]);

    // 2.5) Show waiting message if backend is slow
    const waitingTimeout = setTimeout(() => {
      setMessages(m => [
        ...m.filter(msg => !msg.waiting),
        { type: 'bot', text: "Just a minute, hang in there—I'm sorting through my product list for you!", time: timeStamp(), waiting: true }
      ]);
      // Start WhatsApp fallback timer (5 minutes = 300,000 ms)
      const waTimeout = setTimeout(() => {
        setMessages(m => {
          // Remove waiting message
          const filtered = m.filter(msg => !msg.waiting && !msg.isTyping);
          const waMsg = encodeURIComponent(`Hi MamaTega! I have a question: ${prompt}`);
          const waLink = `https://wa.me/2348189880899?text=${waMsg}`;
          return [
            ...filtered,
            {
              type: 'bot',
              text: `If I can’t answer your question, you can reach out to us via WhatsApp by clicking [this link](${waLink}) and we’ll help you right away!`,
              time: timeStamp(),
              waFallback: true
            }
          ];
        });
      }, 300000); // 5 minutes
      setWhatsAppTimeout(waTimeout);
    }, 4000);

    const start = Date.now();
    let answer = '', results = [], view_all_link = '', newSugs = [];

    // Determine backend API URL based on environment
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // Use Render backend for production
    const API_URL = isLocalhost
      ? 'http://localhost:10000/ask'
      : 'https://skincare-ai-backend.onrender.com/ask';

    const history = messages.slice(-15).map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    try {
      const res = await axios.post(API_URL, {
        prompt,
        history,
        nameAskedBefore,
        ...(sessionId && { sessionId }),
      });
      const data = res.data;
      if (data.sessionId) setSessionId(data.sessionId);
      answer = data.answer;
      results = data.results || [];
      view_all_link = data.view_all_link || '';
      newSugs = data.suggestions || [];
      
      // Check if the AI asked for the name and mark it as asked
      if (answer && (answer.includes("What may I call you") || answer.includes("What should I call you") || answer.includes("What's your name"))) {
        setNameAskedBefore(true);
        localStorage.setItem('name_asked_before', 'true');
      }
    } catch (err) {
      console.error(err);
      answer = null;
    }

    // Check if answer indicates product availability issues or API limits
    const lowerAnswer = answer ? answer.toLowerCase() : '';
    const lowerPrompt = prompt.toLowerCase();
    
    // Keywords that indicate product availability issues or API limits
    const availabilityKeywords = [
      'don\'t have', 'don\'t carry', 'not available', 'out of stock', 'currently unavailable',
      'not in our inventory', 'don\'t stock', 'unfortunately we don\'t', 'we don\'t have',
      'not available in our store', 'don\'t have this brand', 'don\'t carry this brand'
    ];
    
    const apiLimitKeywords = [
      'rate limit', 'api limit', 'temporarily unavailable', 'service temporarily',
      'unable to process', 'cannot confirm', 'can\'t confirm', 'unable to check',
      'service error', 'temporarily down', 'busy at the moment'
    ];
    
    const needsWhatsApp = availabilityKeywords.some(keyword => lowerAnswer.includes(keyword)) ||
                         apiLimitKeywords.some(keyword => lowerAnswer.includes(keyword)) ||
                         !answer; // No answer means API error
    
    if (needsWhatsApp) {
      // Create WhatsApp message with user's question
      const whatsappMessage = `Hi MamaTega! I have a question about: ${prompt}\n\nCan you help me with this?`;
      const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
      
      // Replace or append WhatsApp fallback message
      answer = `I'm having trouble checking that for you right now. Let me connect you directly with our team who can help you better!\n\n[Click here to chat on WhatsApp](${whatsappLink})`;
    }

    // Check if user wants to connect to WhatsApp or Instagram (after getting response)
    const whatsappKeywords = ['whatsapp', 'whats app', 'wa'];
    const instagramKeywords = ['instagram', 'insta', 'ig', 'dm'];
    const generalContactKeywords = ['connect', 'message', 'chat', 'contact', 'help'];
    const shoppingCompleteKeywords = ['ready', 'done', 'complete', 'finish', 'order', 'buy', 'purchase', 'checkout'];
    const storeVisitKeywords = ['store', 'visit', 'come', 'location', 'address'];
    
    const isWhatsAppRequest = whatsappKeywords.some(keyword => lowerPrompt.includes(keyword));
    const isInstagramRequest = instagramKeywords.some(keyword => lowerPrompt.includes(keyword));
    const isGeneralContactRequest = generalContactKeywords.some(keyword => lowerPrompt.includes(keyword));
    const isShoppingCompleteRequest = shoppingCompleteKeywords.some(keyword => lowerPrompt.includes(keyword));
    const isStoreVisitRequest = storeVisitKeywords.some(keyword => lowerPrompt.includes(keyword));
    
    // Check if this is a response to a cart message or order options
    const lastBotMessage = messages.filter(m => m.type === 'bot').pop();
    const isCartResponse = lastBotMessage && lastBotMessage.isCartMessage;
    const isOrderOptionsResponse = lastBotMessage && lastBotMessage.isOrderOptions;
    
    if (isShoppingCompleteRequest) {
      // User is ready to complete shopping - show order options
      handleShoppingComplete();
      answer = null; // Don't send AI response, use the order options message
    } else if (isWhatsAppRequest && (isCartResponse || isOrderOptionsResponse)) {
      // Use the pre-generated WhatsApp link if available, otherwise create one
      if (lastBotMessage.whatsappLink) {
        window.open(lastBotMessage.whatsappLink, '_blank');
        answer = "Perfect! I've opened WhatsApp for you with your complete order details including quantities and prices. You can now chat directly with our team to complete your purchase! 📱";
      } else {
        // Fallback - get cart items for WhatsApp message
        const cartItems = lastBotMessage.cartItems || [];
        const itemNames = cartItems.map(item => item.product_title);
        const itemQuantities = cartItems.map(item => item.quantity);
        const whatsappMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => `${index + 1}. ${item} (Qty: ${itemQuantities[index]})`).join('\n')}\n\nCan you help me with these products?`;
        connectToWhatsApp(whatsappMessage);
        answer = "Perfect! I've opened WhatsApp for you with your cart items. You can now chat directly with our team for personalized assistance! 📱";
      }
    } else if (isInstagramRequest && (isCartResponse || isOrderOptionsResponse)) {
      // Use the pre-generated Instagram link if available, otherwise create one
      if (lastBotMessage.instagramLink) {
        window.open(lastBotMessage.instagramLink, '_blank');
        answer = "Perfect! I've opened Instagram DM for you. You can now message our team directly to complete your order! 📸";
      } else {
        // Fallback - get cart items for Instagram message
        const cartItems = lastBotMessage.cartItems || [];
        const itemNames = cartItems.map(item => item.product_title);
        const itemQuantities = cartItems.map(item => item.quantity);
        const instagramMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => `${index + 1}. ${item} (Qty: ${itemQuantities[index]})`).join('\n')}\n\nCan you help me with these products?`;
        connectToInstagram(instagramMessage);
        answer = "Perfect! I've opened Instagram DM for you. You can now message our team directly for personalized assistance! 📸";
      }
    } else if (isStoreVisitRequest && isOrderOptionsResponse) {
      // User wants to visit store
      answer = "Great choice! Here's our store information:\n\n📍 **MamaTega Cosmetics Store**\n🕒 **Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n📞 **Phone:** +234 818 988 0899\n\nWe'd love to see you in person! Our team will be happy to help you with your selections and provide personalized recommendations. 🛍️";
    } else if (isWhatsAppRequest) {
      // General WhatsApp request
      connectToWhatsApp();
      answer = "Great! I've opened WhatsApp for you. You can now chat directly with our team! 📱";
    } else if (isInstagramRequest) {
      // General Instagram request
      connectToInstagram();
      answer = "Great! I've opened Instagram DM for you. You can now message our team directly! 📸";
    } else if (isGeneralContactRequest && isCartResponse) {
      // General contact request with cart - offer both options
      const cartItems = lastBotMessage.cartItems || [];
      const itemNames = cartItems.map(item => item.product_title);
      const itemQuantities = cartItems.map(item => item.quantity);
      const whatsappMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => `${index + 1}. ${item} (Qty: ${itemQuantities[index]})`).join('\n')}\n\nCan you help me with these products?`;
      connectToWhatsApp(whatsappMessage);
      
      answer = "I've opened WhatsApp for you with your cart items! You can also reach us on Instagram DM if you prefer. 📱📸";
    }

    clearTimeout(waitingTimeout);
    if (whatsAppTimeout) clearTimeout(whatsAppTimeout);
    setWhatsAppTimeout(null);

    // Remove waiting message if present
    setMessages(m => m.filter(msg => !msg.waiting));

    // 3) Enforce minimum thinking time
    const elapsed = Date.now() - start;
    if (elapsed < MIN_THINKING_TIME) {
      await new Promise(r => setTimeout(r, MIN_THINKING_TIME - elapsed));
    }

    // 4) Remove typing bubble & add real bot bubble or WhatsApp fallback
    setMessages(m => {
      const withoutTyping = m.filter(mg => !mg.isTyping && !mg.waiting);
      // WhatsApp fallback ONLY if answer is null/empty or an explicit error
      if (!answer) {
        // Only show fallback if 5 minutes have passed (handled by waTimeout above)
        return withoutTyping;
      }
      return [
        ...withoutTyping,
        { type: 'bot', text: answer, results, view_all_link, time: timeStamp() }
      ];
    });

    // 5) Update suggestions if provided
    if (Array.isArray(newSugs) && newSugs.length > 0) setSuggestions(newSugs);

    setLoading(false);
    // Focus input after answer
    setTimeout(() => { inputRef.current?.focus(); }, 100);

    // Set up inactivity timeout (2 minutes)
    const inactivityTimer = setTimeout(() => {
      sendInactivityPrompt();
    }, 2 * 60 * 1000); // 2 minutes
    
    setInactivityTimeout(inactivityTimer);
  };

  return (
    <div ref={chatWidgetRef}>
      {minimized ? (
        <>
          {bubbleVisible && (
            <div className={`chatbot-bubble ${isExciting ? 'exciting' : ''}`} onClick={() => setMinimized(false)}>
              <span className="bubble-icon" role="img" aria-label="shopping bag">🧓🏾</span>
              <span className="bubble-text">{bubbleText}</span>
            </div>
          )}
        </>
      ) : (
        <div className="chatbot-widget chatbot-widget-open">
          <div className="chat-header">
            <div className="header-content">
              <div className="header-top">
                <div className="brand-info">
                  <span className="brand-name">MamaTega Cosmetics</span>
                  <span className="store-hours">🕒 Mon-Sat: 8:00 AM-8:00 PM | Sun: 1:00 PM-7:00 PM</span>
                </div>
                {/* Removed dark/light mode toggle button */}
                <button className="close-btn" onClick={handleCloseWidget}>&times;</button>
              </div>
              <div className="header-bottom">
                <div className="conversation-menu-container">
                  <button 
                    className="new-conversation-btn" 
                    onClick={() => setShowConversationMenu(!showConversationMenu)}
                    title="Conversation options"
                  >
                    <span className="new-conversation-text">New conversation</span>
                    <span className="new-conversation-icon">▼</span>
                  </button>
                  {showConversationMenu && (
                    <div className="conversation-dropdown" ref={menuRef}>
                      <button onClick={clearChat} className="dropdown-item">
                        <span>✏️</span> Start New
                      </button>
                      <button onClick={clearAllHistory} className="dropdown-item clear-all">
                        <span>🗑️</span> Clear All History
                      </button>
                      {conversationHistory.length > 0 && (
                        <>
                          <div className="dropdown-divider">Recent Conversations</div>
                          {conversationHistory.map((conv) => (
                            <button 
                              key={conv.id} 
                              onClick={() => loadConversation(conv)} 
                              className="dropdown-item"
                            >
                              <span>💬</span> {conv.title}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="chat-messages">
            {messages.map((msg, i) => {
              // Bounce animation for bot answer if it's responding to the last user message
              let bounce = false;
              if (
                msg.type === 'bot' &&
                i > 0 &&
                messages[i-1].type === 'user' &&
                messages[i-1] === messages.slice().reverse().find(m => m.type === 'user')
              ) bounce = true;
              // Add glow class only to the last user message (more explicit logic)
              const userMessages = messages.filter(m => m.type === 'user');
              const isLastUser = msg.type === 'user' && userMessages.length > 0 && userMessages[userMessages.length - 1] === msg;
              return (
                <div key={i}
                  className={`chat-message ${msg.type}${msg.isTyping ? ' typing' : ''}${bounce ? ' bounce' : ''}${isLastUser ? ' glow' : ''}`}>
                  <div className="message-bubble">
                    {/* Only show MamaTega label for bot messages, and always show the message text below, but not for typing indicator */}
                    {msg.type === 'bot' && msg.isTyping && (
                      <span className="typing-dots">
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </span>
                    )}
                    {msg.type === 'bot' && !msg.isTyping && <div className={`bubble-label bot-label${isDark ? ' dark' : ''}`}>MamaTega</div>}
                    {msg.type === 'bot' && !msg.isTyping && msg.text && (
                      <ReactMarkdown
                        components={{
                          a: ({node, children, ...props}) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 'inherit',
                                fontFamily: 'inherit',
                                textDecoration: 'underline',
                              }}
                            >
                              {children && children.length > 0 ? children : <span>Link</span>}
                            </a>
                          )
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                    {/* For user messages, show only the message text, no label */}
                    {msg.type === 'user' && (
                      <ReactMarkdown
                        components={{
                          a: ({node, children, ...props}) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 'inherit',
                                fontFamily: 'inherit',
                                textDecoration: 'underline',
                              }}
                            >
                              {children && children.length > 0 ? children : <span>Link</span>}
                            </a>
                          )
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                    {msg.results?.length > 0 && !msg.isTyping && (
                      <div className="message-html">
                        <p>Here’s what I found:</p>
                        {msg.results.map((p,j) => (
                          <div key={j} className="product-item">
                            <a href={p.link} target="_blank" rel="noreferrer">{p.title}</a>
                          </div>
                        ))}
                        {msg.view_all_link && (
                          <div className="view-all-block">
                            <a href={msg.view_all_link} target="_blank" rel="noreferrer"><span aria-label="View All Matches" role="img">🔍</span> View All Matches</a>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.time && !msg.isTyping && <div className="timestamp">{msg.time}</div>}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {/* Only show suggestions at the start, before any user message */}
          {messages.length === 1 && (
            <div className="suggestions-container suggestions-vertical initial-suggestions">
              {(suggestions && suggestions.length > 0 ? suggestions.slice(0, 3) : getRandomSuggestions().slice(0, 3)).map((s,i) => (
                <button
                  key={i}
                  className={`suggestion-btn initial-suggestion-btn${selectedSuggestion === i ? ' selected' : ''}`}
                  onClick={() => { setSelectedSuggestion(i); sendMessage(s); }}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="input-toolbar" style={{ marginTop: 0 }}>
            <div className="input-pill">
              <input
                ref={inputRef}
                placeholder="Ask me anything..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
              />
            </div>
            <button
              className="ask-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}