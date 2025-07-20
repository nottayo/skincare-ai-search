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

const STATIC_WELCOME_MESSAGE = "Welcome to MamaTega Cosmetics! How can I help you today?";

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
  const MIN_THINKING_TIME = 3500; // ms - increased for more natural feel
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const menuRef = useRef(null);
  const chatWidgetRef = useRef(null);
  const [cartMessageShown, setCartMessageShown] = useState(false);
  const [whatsAppTimeout, setWhatsAppTimeout] = useState(null);
  const [isDark, setIsDark] = useState(() => document.body.classList.contains('dark-mode'));
  const [nameAskedBefore, setNameAskedBefore] = useState(() => {
    return localStorage.getItem('name_asked_before') === 'true';
  });
  const [bubbleText, setBubbleText] = useState('Ask MamaTega');
  
  // Notification badge state
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(() => {
    const saved = localStorage.getItem('chat_messages');
    const savedMessages = saved ? JSON.parse(saved) : [];
    return savedMessages.length > 0 ? savedMessages.length - 1 : -1;
  });
  
  // Smart cart tracking states
  const [lastCartState, setLastCartState] = useState([]);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [lastCartUpdateTime, setLastCartUpdateTime] = useState(null);
  const [cartItemsAdded, setCartItemsAdded] = useState([]);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Cart checking function - moved outside useEffect for global access
  // Cart checking function - optimized to prevent excessive calls
  const checkCart = () => {
    // Prevent multiple simultaneous cart checks
    if (checkCart.isRunning) return;
    checkCart.isRunning = true;
    
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        const currentCartItems = cart.items || [];
        const currentCartIds = currentCartItems.map(item => item.id).sort();
        const lastCartIds = lastCartState.map(item => item.id).sort();
        
        // Check if cart actually changed
        if (JSON.stringify(currentCartIds) !== JSON.stringify(lastCartIds)) {
          // Find newly added items
          const newItems = currentCartItems.filter(item => 
            !lastCartState.some(lastItem => lastItem.id === item.id)
          );
          
          // Find removed items
          const removedItems = lastCartState.filter(item => 
            !currentCartItems.some(currentItem => currentItem.id === item.id)
          );
          
          // Update cart state
          setLastCartState(currentCartItems);
          setLastCartUpdateTime(Date.now());
          
          // Handle cart changes - always update immediately
          if (newItems.length > 0) {
            // Items were added
            setCartItemsAdded(prev => [...prev, ...newItems]);
            
            // Always update bubble and cart message immediately
            updateBubbleText(currentCartItems, newItems);
            // Call async function without await to avoid blocking
            updateExistingCartMessage(currentCartItems, newItems).catch(console.error);
          } else if (removedItems.length > 0) {
            // Items were removed
            setCartItemsAdded(prev => prev.filter(item => 
              !removedItems.some(removed => removed.id === item.id)
            ));
            
            // Update bubble text for cart changes
            updateBubbleText(currentCartItems);
            // Call async function without await to avoid blocking
            updateExistingCartMessage(currentCartItems, []).catch(console.error);
          }
          
          // Store cart IDs in localStorage for persistence
          localStorage.setItem('last_cart_ids', JSON.stringify(currentCartIds));
        }
      })
      .catch(() => {
        // If cart fetch fails, assume empty cart
        setLastCartState([]);
        setCartItemsAdded([]);
        updateBubbleText([]);
      })
      .finally(() => {
        // Reset the running flag after a short delay to prevent rapid successive calls
        setTimeout(() => {
          checkCart.isRunning = false;
        }, 500);
      });
  };
  


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
    // Only scroll for truly new messages, not updates, and only if user hasn't scrolled up
    if (messages.length > 0 && shouldScrollToBottom && !userScrolledUp) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShouldScrollToBottom(false); // Reset after scrolling
    }
    
    // Update unread count when new messages arrive
    if (messages.length > lastReadMessageIndex + 1 && minimized) {
      const newUnreadCount = messages.length - (lastReadMessageIndex + 1);
      setUnreadCount(newUnreadCount);
    }
    
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages, shouldScrollToBottom, userScrolledUp, lastReadMessageIndex, minimized]);

  // Always scroll to bottom when chat is opened or messages change
  useEffect(() => {
    if (!minimized && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [minimized, messages]);

  // Add scroll event listener to track user scrolling
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    const handleScroll = () => {
      const isAtBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 5;
      setUserScrolledUp(!isAtBottom);
      
      // If user manually scrolls to bottom, allow auto-scroll again
      if (isAtBottom) {
        setShouldScrollToBottom(true);
      }
    };

    chatContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => chatContainer.removeEventListener('scroll', handleScroll);
  }, [minimized]);

  // Prevent input field from capturing scroll events
  useEffect(() => {
    const inputField = inputRef.current;
    if (!inputField) return;

    const preventScrollCapture = (e) => {
      // Allow scroll events to bubble up to the chat container
      e.stopPropagation();
    };

    const preventScrollOnInput = (e) => {
      // Prevent the input field from capturing scroll events
      if (e.target === inputField) {
        e.stopPropagation();
      }
    };

    inputField.addEventListener('wheel', preventScrollCapture, { passive: true });
    inputField.addEventListener('touchmove', preventScrollCapture, { passive: true });
    inputField.addEventListener('scroll', preventScrollOnInput, { passive: true });

    // Also prevent the input container from capturing scroll
    const inputContainer = inputField.closest('.input-pill');
    if (inputContainer) {
      inputContainer.addEventListener('wheel', preventScrollCapture, { passive: true });
      inputContainer.addEventListener('touchmove', preventScrollCapture, { passive: true });
    }

    return () => {
      inputField.removeEventListener('wheel', preventScrollCapture);
      inputField.removeEventListener('touchmove', preventScrollCapture);
      inputField.removeEventListener('scroll', preventScrollOnInput);
      if (inputContainer) {
        inputContainer.removeEventListener('wheel', preventScrollCapture);
        inputContainer.removeEventListener('touchmove', preventScrollCapture);
      }
    };
  }, []);

  // Separate effect for dynamic widget scrolling


  // Track user interaction when chat is opened
  useEffect(() => {
    if (!minimized) {
      // Mark that user has interacted by opening the chat
      setUserHasInteracted(true);
      
      // Mark all messages as read when chat is opened
      setLastReadMessageIndex(messages.length - 1);
      setUnreadCount(0);
      
      // Immediately check cart when chat opens to get latest state
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          const currentCartItems = cart.items || [];
          setLastCartState(currentCartItems);
          updateBubbleText(currentCartItems);
        })
        .catch(() => {
          // If cart fetch fails, assume empty cart
          setLastCartState([]);
          updateBubbleText([]);
        });
      
      // Set up initial inactivity timeout when chat opens
      const initialInactivityTimer = setTimeout(() => {
        sendInactivityPrompt();
      }, 2 * 60 * 1000); // 2 minutes
      
      setInactivityTimeout(initialInactivityTimer);
    }
  }, [minimized, messages.length]);

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

  // Minimize chat widget when clicking outside (only when chat is open)
  useEffect(() => {
    const handleClickOutsideToMinimize = (event) => {
      if (!minimized && chatWidgetRef.current && !chatWidgetRef.current.contains(event.target)) {
        setMinimized(true);
        setBubbleVisible(true);
        setShowConversationMenu(false);
      }
    };

    if (!minimized) {
      document.addEventListener('mousedown', handleClickOutsideToMinimize);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutsideToMinimize);
    };
  }, [minimized]);

  // Save conversationHistory to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conversation_history', JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  // Set initial welcome message if no messages exist
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        type: 'bot',
        text: STATIC_WELCOME_MESSAGE,
        time: timeStamp()
      }]);
    }
  }, []);



  // Smart cart monitoring - tracks cart changes and user interaction
  // Smart cart tracking with immediate updates
  useEffect(() => {
    // Check cart immediately
    checkCart();

    // Set up interval to check cart every 3 seconds for balanced updates
    const interval = setInterval(checkCart, 3000);

    // Check cart when page becomes visible (user switches back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkCart();
      }
    };

    // Check cart on user interactions (click, scroll, etc.)
    const handleUserInteraction = () => {
      checkCart();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, [lastCartState, userHasInteracted, lastCartUpdateTime]);



  // Reset user interaction state after 5 minutes of inactivity
  useEffect(() => {
    if (userHasInteracted) {
      const resetTimer = setTimeout(() => {
        setUserHasInteracted(false);
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearTimeout(resetTimer);
    }
  }, [userHasInteracted]);

  const timeStamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Function to format messages with clickable links
  const formatMessageWithLinks = (text, whatsappUrl = null) => {
    if (!text) return '';
    
    // Handle markdown links first (like [Click here to chat on WhatsApp](URL))
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let lastIndex = 0;
    const elements = [];
    
    while ((match = markdownLinkRegex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      
      // Add the clickable link
      elements.push(
        <a
          key={`link-${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: 'inherit',
            fontFamily: 'inherit',
            textDecoration: 'underline'
          }}
        >
          {match[1]}
        </a>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      elements.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    
    // If we found markdown links, return the processed elements
    if (elements.length > 0) {
      return elements;
    }
    
    // If there's a WhatsApp URL, replace "Link" with a clickable link
    if (whatsappUrl && text.includes('Link')) {
      const parts = text.split('Link');
      return parts.map((part, index) => {
        if (index < parts.length - 1) {
          return (
            <React.Fragment key={index}>
              <span>{part}</span>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 'inherit',
                  fontFamily: 'inherit',
                  textDecoration: 'underline'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  // Just copy the link to clipboard instead of opening
                  navigator.clipboard.writeText(whatsappUrl);
                  alert('WhatsApp link copied to clipboard!');
                }}
              >
                Link
              </a>
            </React.Fragment>
          );
        } else {
          return <span key={index}>{part}</span>;
        }
      });
    }
    
    // Regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    // Split text by URLs and create React elements
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // This is a URL - make it clickable but show "Link" instead of the URL
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#fff',
              fontWeight: 600,
              fontSize: 'inherit',
              fontFamily: 'inherit',
              textDecoration: 'underline',
              wordBreak: 'break-all'
            }}
          >
            Link
          </a>
        );
      } else {
        // This is regular text
        return <span key={index}>{part}</span>;
      }
    });
  };

  // Function to get random welcome message
  const getRandomWelcomeMessage = () => {
    const welcomeMessages = [
      "Hello! I am your MamaTega Assistant. How can I help you today?",
      "Welcome to MamaTega! I am here to assist you with all your beauty needs.",
      "Hi there! I am your MamaTega beauty consultant. What can I help you with?",
      "Greetings! I am your MamaTega Assistant ready to help you find the perfect products.",
      "Welcome! I am your MamaTega beauty expert. How may I assist you today?",
      "Hello beautiful! I am your MamaTega Assistant. What brings you here today?",
      "Hi! I am your MamaTega beauty guide. How can I make your day more beautiful?",
      "Welcome to MamaTega Cosmetics! I am here to help you discover amazing products.",
      "Hello! I am your MamaTega beauty advisor. What would you like to explore today?",
      "Hi there! I am your MamaTega Assistant. Ready to help you find your perfect beauty routine.",
      "Welcome! I am your MamaTega beauty specialist. How can I assist you today?",
      "Hello! I am your MamaTega beauty consultant. What can I help you discover?",
      "Hi! I am your MamaTega Assistant. Let us find the perfect products for you.",
      "Welcome to MamaTega! I am your beauty expert. How may I help you today?",
      "Hello! I am your MamaTega beauty guide. What brings you to our store today?"
    ];
    
    return welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  };

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
      text: STATIC_WELCOME_MESSAGE,
      time: timeStamp()
    }]);
    setSuggestions(getRandomSuggestions());
    setSelectedSuggestion(null);
    setShowConversationMenu(false);
    // Reset name asked flag for new conversation
    setNameAskedBefore(false);
    localStorage.removeItem('name_asked_before');
    // Reset smart cart tracking states
    setUserHasInteracted(false);
    setCartItemsAdded([]);
    setLastCartUpdateTime(null);
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
    return whatsappLink;
  };

  // Function to handle Instagram DM connection
  const connectToInstagram = (message = '') => {
    const defaultMessage = 'Hi MamaTega! I need help with my order.';
    const instagramMessage = message || defaultMessage;
    // Instagram profile URL
    const instagramLink = `https://www.instagram.com/mamategacosmeticsandspa/`;
    return instagramLink;
  };

  // Smart function to update bubble text based on cart activity


  const updateBubbleText = (cartItems, newItems = []) => {
    if (cartItems.length === 0) {
      setBubbleText('Ask MamaTega');
      setIsExciting(false);
      return;
    }
    
    // If new items were added, create a specific message
    if (newItems.length > 0) {
      const itemNames = newItems.map(item => item.product_title);
      let message;
      
      if (newItems.length === 1) {
        message = `Added ${itemNames[0]} to cart! 🛒`;
      } else if (newItems.length === 2) {
        message = `Added ${itemNames[0]} & ${itemNames[1]} to cart! 🛒`;
      } else {
        message = `Added ${newItems.length} items to cart! 🛒`;
      }
      
      setBubbleText(message);
      setIsExciting(true);
    } else {
      // General cart message if no specific new items
      setBubbleText('Helllllllloooooo! 👋');
      setIsExciting(true);
    }
  };

  // Function to create or update cart page and generate cart message
  const updateExistingCartMessage = async (cartItems, newItems = []) => {
    try {
      // Create or update cart page
      const response = await fetch('https://nodejs-backend-h8mygbapi-tayos-projects-cec8e285.vercel.app/api/cart/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cartItems,
          user_info: {
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create cart page');
      }
      
      const cartData = await response.json();
      const cartId = cartData.cart_id;
      const cartUrl = `${window.location.origin}${cartData.cart_url}`;
      
      setMessages(prevMessages => {
        // Find the last cart message
        const lastCartMessageIndex = prevMessages.findLastIndex(msg => 
          msg.isCartMessage || msg.text?.includes('cart') || msg.text?.includes('items')
        );
        
        if (lastCartMessageIndex !== -1) {
          // Update the existing cart message
          const updatedMessages = [...prevMessages];
          const existingMessage = updatedMessages[lastCartMessageIndex];
          
          // Create updated cart message with cart page link
          const cartMessages = [
            `Great! I've created a beautiful cart page for your items. You can view your cart here: **[Here is my cart](${cartUrl})**\n\nThis page shows all your items with prices and quantities. You can easily share this link with us on WhatsApp or Instagram to complete your order! 🛒✨`,
            `Perfect! I've organized your cart items into a beautiful page. Check it out: **[Here is my cart](${cartUrl})**\n\nThis makes it super easy to share your order with us. Just copy the link and send it to us on WhatsApp or Instagram! 📱💫`,
            `Awesome! I've created a cart page for your items: **[Here is my cart](${cartUrl})**\n\nThis page displays all your selections with details. Simply share this link with us to complete your purchase! 🎯✨`,
            `Excellent! I've prepared your cart items in a beautiful page: **[Here is my cart](${cartUrl})**\n\nThis shows everything you've selected. Just share this link with us on WhatsApp or Instagram to place your order! 🛍️💖`,
            `Fantastic! I've organized your cart into a lovely page: **[Here is my cart](${cartUrl})**\n\nThis displays all your items clearly. Share this link with us to complete your order easily! 🌟📱`
          ];
          
          const randomMessage = cartMessages[Math.floor(Math.random() * cartMessages.length)];
          
          // Update the existing message
          updatedMessages[lastCartMessageIndex] = {
            ...existingMessage,
            text: randomMessage,
            time: timeStamp(),
            cartItems: cartItems,
            cartId: cartId,
            cartUrl: cartUrl,
            isExistingUpdate: true // Mark as update to prevent auto-scroll
          };
          
          return updatedMessages;
        } else {
          // If no existing cart message found, create a new one (only if user hasn't interacted)
          if (!userHasInteracted) {
            const cartMessages = [
              `Great! I've created a beautiful cart page for your items. You can view your cart here: **[Here is my cart](${cartUrl})**\n\nThis page shows all your items with prices and quantities. You can easily share this link with us on WhatsApp or Instagram to complete your order! 🛒✨`,
              `Perfect! I've organized your cart items into a beautiful page. Check it out: **[Here is my cart](${cartUrl})**\n\nThis makes it super easy to share your order with us. Just copy the link and send it to us on WhatsApp or Instagram! 📱💫`,
              `Awesome! I've created a cart page for your items: **[Here is my cart](${cartUrl})**\n\nThis page displays all your selections with details. Simply share this link with us to complete your purchase! 🎯✨`,
              `Excellent! I've prepared your cart items in a beautiful page: **[Here is my cart](${cartUrl})**\n\nThis shows everything you've selected. Just share this link with us on WhatsApp or Instagram to place your order! 🛍️💖`,
              `Fantastic! I've organized your cart into a lovely page: **[Here is my cart](${cartUrl})**\n\nThis displays all your items clearly. Share this link with us to complete your order easily! 🌟📱`
            ];
            
            const randomMessage = cartMessages[Math.floor(Math.random() * cartMessages.length)];
            
            return [
              ...prevMessages,
              {
                type: 'bot',
                text: randomMessage,
                time: timeStamp(),
                isCartMessage: true,
                cartItems: cartItems,
                cartId: cartId,
                cartUrl: cartUrl
              }
            ];
          }
          
          return prevMessages;
        }
      });
      
    } catch (error) {
      console.error('Error creating cart page:', error);
      // Fallback to old message format if cart page creation fails
      setMessages(prevMessages => {
        const lastCartMessageIndex = prevMessages.findLastIndex(msg => 
          msg.isCartMessage || msg.text?.includes('cart') || msg.text?.includes('items')
        );
        
        if (lastCartMessageIndex !== -1) {
          const updatedMessages = [...prevMessages];
          const existingMessage = updatedMessages[lastCartMessageIndex];
          
          const itemNames = cartItems.map(item => item.product_title);
          const itemQuantities = cartItems.map(item => item.quantity);
          const itemVariants = cartItems.map(item => {
            const variantOptions = item.variant_options || [];
            const validVariants = variantOptions.filter(option => 
              option && option.name && option.value && 
              option.name !== 'undefined' && option.value !== 'undefined' &&
              option.name.trim() !== '' && option.value.trim() !== ''
            );
            
            const variantText = validVariants.length > 0 
              ? ` - ${validVariants.map(option => `${option.name}: ${option.value}`).join(', ')}`
              : '';
            return variantText;
          });
          
          const numberedItems = itemNames.map((item, index) => {
            const variantInfo = itemVariants[index];
            return `${index + 1}. ${item} (Qty: ${itemQuantities[index]}${variantInfo})`;
          }).join('\n');
          
          const whatsappMessage = `Hi! I have these items in my cart:\n${itemNames.map((item, index) => {
            const variantInfo = itemVariants[index];
            return `${index + 1}. ${item} (Qty: ${itemQuantities[index]}${variantInfo})`;
          }).join('\n')}\n\nCan you help me with these products?`;
          const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
          const instagramLink = `https://www.instagram.com/mamategacosmeticsandspa/`;
          
          const fallbackMessage = `I can see you've selected:\n\n${numberedItems}\n\nNeed help? [Chat on WhatsApp](${whatsappLink}) or [Message on Instagram](${instagramLink})`;
          
          updatedMessages[lastCartMessageIndex] = {
            ...existingMessage,
            text: fallbackMessage,
            time: timeStamp(),
            cartItems: cartItems,
            isExistingUpdate: true
          };
          
          return updatedMessages;
        }
        
        return prevMessages;
      });
    }
  };

  // Function to send inactivity prompts
  const sendInactivityPrompt = () => {
    if (!userHasInteracted) return;
    if (messages.some(m => m.isInactivityPrompt)) return;
    const inactivityPrompts = [
      "Need help choosing? Try asking 'What's good for acne?' or 'Which moisturizer is best?' ✨"
    ];
    const randomPrompt = inactivityPrompts[0];
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
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }
    };
  }, [inactivityTimeout]);

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
        
        const whatsappMessage = `Hi! I'd like to complete my order:\n\n${itemDetails}\n\nTotal: $${totalPrice}\n\nCan you help me process this order?`;
        const whatsappLink = `https://wa.me/2348189880899?text=${encodeURIComponent(whatsappMessage)}`;
        const instagramLink = `https://www.instagram.com/mamategacosmeticsandspa/`;
        
        const orderOptions = `Great! How would you like to complete your order?\n\n**Choose your preferred method:**\n\n🛒 **Visit Store** - Come shop directly at our location\n📱 **[Order via WhatsApp](${whatsappLink})** - Complete order with payment\n📸 **Message on Instagram** - Order via Instagram DM\n\n**Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n\n*Note: Prices and product availability may change frequently as they are dynamic.*\n\nLet me know which option you prefer!`;
        
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
        const orderOptions = `Great! How would you like to complete your order?\n\n**Choose your preferred method:**\n\n🛒 **Visit Store** - Come shop directly at our location\n📱 **[Order via WhatsApp](https://wa.me/2348189880899)** - Complete order with payment\n📸 **Message on Instagram** - Order via Instagram DM\n\n**Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n\n*Note: Prices and product availability may change frequently as they are dynamic.*\n\nLet me know which option you prefer!`;
        
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



    // Mark that user has interacted by sending a message
    setUserHasInteracted(true);

    // Clear inactivity timeout when user sends a message
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
    }

    // 1) Add user bubble
    setMessages(m => {
      setShouldScrollToBottom(true); // Trigger scroll for user message
      return [...m, { type: 'user', text: prompt, time: timeStamp() }];
    });
    setInput('');
    setLoading(true);
    setSelectedSuggestion(null); // Reset selection after sending
    
    // Don't block input during loading - allow user to continue typing

    // 2) Show typing indicator
    const typingMsg = { type: 'bot', isTyping: true };
    setMessages(m => {
      setShouldScrollToBottom(true); // Trigger scroll for bot response
      return [...m, typingMsg];
    });

    // 2.5) Show waiting message if backend is slow
    const waitingTimeout = setTimeout(() => {
      setMessages(m => [
        ...m.filter(msg => !msg.waiting),
        { type: 'bot', text: "Just a minute, hang in there!", time: timeStamp(), waiting: true }
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
    let answer = '', results = [], view_all_link = '', newSugs = [], whatsappUrl = '';

    // Determine backend API URL based on environment
    const API_URL = 'https://nodejs-backend-h8mygbapi-tayos-projects-cec8e285.vercel.app/ask';

    const history = messages.slice(-15).map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    // Generate chat ID for this conversation
    const chatId = sessionId || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let apiError = null;
    try {
      console.log('[FRONTEND DEBUG] Sending request to:', API_URL);
      console.log('[FRONTEND DEBUG] Request payload:', { prompt, history: history.length, nameAskedBefore, chatId });
      
      const res = await axios.post(API_URL, {
        prompt,
        history,
        nameAskedBefore,
        chatId,
        timestamp: Date.now(), // Cache busting
        ...(sessionId && { sessionId }),
      }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const data = res.data;
      
      console.log('[FRONTEND DEBUG] Response received:', data);
      console.log('[FRONTEND DEBUG] Answer:', data.answer);
      console.log('[FRONTEND DEBUG] Results count:', data.results ? data.results.length : 0);
      console.log('[FRONTEND DEBUG] Answer length:', data.answer ? data.answer.length : 0);
      console.log('[FRONTEND DEBUG] Answer type:', typeof data.answer);
      
      if (data.sessionId) setSessionId(data.sessionId);
      answer = data.answer;
      results = data.results || [];
      view_all_link = data.view_all_link || '';
      newSugs = data.suggestions || [];
      whatsappUrl = data.whatsappUrl || '';
      
      // Check if the AI asked for the name and mark it as asked
      if (answer && (answer.includes("What may I call you") || answer.includes("What should I call you") || answer.includes("What's your name"))) {
        setNameAskedBefore(true);
        localStorage.setItem('name_asked_before', 'true');
      }
    } catch (err) {
      console.error(err);
      answer = null;
      apiError = err;
    }

    // Check if answer indicates product availability issues or API limits
    const lowerAnswer = answer ? answer.toLowerCase() : '';
    const lowerPrompt = prompt.toLowerCase();
    
    console.log('[FRONTEND DEBUG] Checking answer for WhatsApp fallback:');
    console.log('[FRONTEND DEBUG] Answer:', answer);
    console.log('[FRONTEND DEBUG] Lower answer:', lowerAnswer);
    console.log('[FRONTEND DEBUG] API error:', apiError);
    
    // Keywords that indicate product availability issues or API limits
    const availabilityKeywords = [
      'don\'t have', 'don\'t carry', 'not available', 'out of stock', 'currently unavailable',
      'not in our inventory', 'don\'t stock', 'unfortunately we don\'t', 'we don\'t have',
      'not available in our store', 'don\'t have this brand', 'don\'t carry this brand'
    ];
    
    console.log('[FRONTEND DEBUG] Checking availability keywords in answer:', lowerAnswer);
    console.log('[FRONTEND DEBUG] Availability keywords found:', availabilityKeywords.filter(keyword => lowerAnswer.includes(keyword)));
    
    const apiLimitKeywords = [
      'rate limit', 'api limit', 'temporarily unavailable', 'service temporarily',
      'unable to process', 'cannot confirm', 'can\'t confirm', 'unable to check',
      'service error', 'temporarily down', 'busy at the moment'
    ];
    
    const needsWhatsApp = availabilityKeywords.some(keyword => lowerAnswer.includes(keyword)) ||
                         apiLimitKeywords.some(keyword => lowerAnswer.includes(keyword)) ||
                         (answer === null && apiError); // Only if there's an actual API error
    
    console.log('[FRONTEND DEBUG] Needs WhatsApp fallback:', needsWhatsApp);
    
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
        answer = `Perfect! Here's your WhatsApp link with your complete order details including quantities and prices: [Click here to chat on WhatsApp](${lastBotMessage.whatsappLink}) 📱`;
      } else {
        // Fallback - get cart items for WhatsApp message
        const cartItems = lastBotMessage.cartItems || [];
        const itemNames = cartItems.map(item => item.product_title);
        const itemQuantities = cartItems.map(item => item.quantity);
        const itemVariants = cartItems.map(item => {
          const variantOptions = item.variant_options || [];
          const validVariants = variantOptions.filter(option => 
            option && option.name && option.value && 
            option.name !== 'undefined' && option.value !== 'undefined' &&
            option.name.trim() !== '' && option.value.trim() !== ''
          );
          
          const variantText = validVariants.length > 0 
            ? ` - ${validVariants.map(option => `${option.name}: ${option.value}`).join(', ')}`
            : '';
          return variantText;
        });
        const whatsappMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => {
          const variantInfo = itemVariants[index];
          return `${index + 1}. ${item} (Qty: ${itemQuantities[index]}${variantInfo})`;
        }).join('\n')}\n\nCan you help me with these products?`;
        const whatsappLink = connectToWhatsApp(whatsappMessage);
        answer = `Perfect! Here's your WhatsApp link with your cart items: [Click here to chat on WhatsApp](${whatsappLink}) 📱`;
      }
    } else if (isInstagramRequest && (isCartResponse || isOrderOptionsResponse)) {
      // Use the pre-generated Instagram link if available, otherwise create one
      if (lastBotMessage.instagramLink) {
        answer = `Perfect! Here's your Instagram link: [Click here to message on Instagram](${lastBotMessage.instagramLink}) 📸`;
      } else {
        // Fallback - get cart items for Instagram message
        const cartItems = lastBotMessage.cartItems || [];
        const itemNames = cartItems.map(item => item.product_title);
        const itemQuantities = cartItems.map(item => item.quantity);
        const itemVariants = cartItems.map(item => {
          const variantOptions = item.variant_options || [];
          const validVariants = variantOptions.filter(option => 
            option && option.name && option.value && 
            option.name !== 'undefined' && option.value !== 'undefined' &&
            option.name.trim() !== '' && option.value.trim() !== ''
          );
          
          const variantText = validVariants.length > 0 
            ? ` - ${validVariants.map(option => `${option.name}: ${option.value}`).join(', ')}`
            : '';
          return variantText;
        });
        const instagramMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => {
          const variantInfo = itemVariants[index];
          return `${index + 1}. ${item} (Qty: ${itemQuantities[index]}${variantInfo})`;
        }).join('\n')}\n\nCan you help me with these products?`;
        const instagramLink = connectToInstagram(instagramMessage);
        answer = `Perfect! Here's your Instagram link: [Click here to message on Instagram](${instagramLink}) 📸`;
      }
    } else if (isStoreVisitRequest && isOrderOptionsResponse) {
      // User wants to visit store
      answer = "Great choice! Here's our store information:\n\n📍 **MamaTega Cosmetics Store**\n🕒 **Store Hours:**\n• Monday–Saturday: 8:00 AM–8:00 PM\n• Sunday: 1:00 PM–7:00 PM\n📞 **Phone:** +234 818 988 0899\n\nWe'd love to see you in person! Our team will be happy to help you with your selections and provide personalized recommendations. 🛍️";
    } else if (isWhatsAppRequest) {
      // General WhatsApp request
      const whatsappLink = connectToWhatsApp();
      answer = `Great! Here's your WhatsApp link: [Click here to chat on WhatsApp](${whatsappLink}) 📱`;
    } else if (isInstagramRequest) {
      // General Instagram request
      const instagramLink = connectToInstagram();
      answer = `Great! Here's your Instagram link: [Click here to message on Instagram](${instagramLink}) 📸`;
    } else if (isGeneralContactRequest && isCartResponse) {
      // General contact request with cart - offer both options
      const cartItems = lastBotMessage.cartItems || [];
      const itemNames = cartItems.map(item => item.product_title);
      const itemQuantities = cartItems.map(item => item.quantity);
      const itemVariants = cartItems.map(item => {
        const variantOptions = item.variant_options || [];
        const validVariants = variantOptions.filter(option => 
          option && option.name && option.value && 
          option.name !== 'undefined' && option.value !== 'undefined' &&
          option.name.trim() !== '' && option.value.trim() !== ''
        );
        
        const variantText = validVariants.length > 0 
          ? ` - ${validVariants.map(option => `${option.name}: ${option.value}`).join(', ')}`
          : '';
        return variantText;
      });
      const whatsappMessage = `Hi MamaTega! I have these items in my cart:\n${itemNames.map((item, index) => {
        const variantInfo = itemVariants[index];
        return `${index + 1}. ${item} (Qty: ${itemQuantities[index]}${variantInfo})`;
      }).join('\n')}\n\nCan you help me with these products?`;
      const whatsappLink = connectToWhatsApp(whatsappMessage);
      const instagramLink = connectToInstagram();
      
      answer = `Here are your contact options with your cart items: [Click here to chat on WhatsApp](${whatsappLink}) or [Click here to message on Instagram](${instagramLink}) 📱📸`;
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

    // 4) Remove typing bubble & add real bot bubble with typing animation
    setMessages(m => {
      const withoutTyping = m.filter(mg => !mg.isTyping && !mg.waiting);
      // WhatsApp fallback ONLY if answer is null/empty or an explicit error
      if (!answer) {
        // Only show fallback if 5 minutes have passed (handled by waTimeout above)
        return withoutTyping;
      }
      
      // Trigger scroll for new bot response
      setShouldScrollToBottom(true);
      
      return [
        ...withoutTyping,
        { 
          type: 'bot', 
          text: '', // Start with empty text
          fullText: answer, // Store the full text for typing animation
          isTyping: true, // Mark as typing to trigger animation
          results, 
          view_all_link, 
          whatsappUrl: whatsappUrl, 
          time: timeStamp() 
        }
      ];
    });

    // Start the typing animation
    console.log('[FRONTEND DEBUG] Starting typing animation for answer:', answer);
    setTimeout(() => {
      setMessages(m => {
        const lastMessage = m[m.length - 1];
        console.log('[FRONTEND DEBUG] Last message:', lastMessage);
        if (lastMessage && lastMessage.type === 'bot' && lastMessage.isTyping && lastMessage.fullText) {
          const fullText = lastMessage.fullText;
          let currentIndex = 0;
          
          const typeNextChar = () => {
            if (currentIndex < fullText.length) {
              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                const lastMsg = updatedMessages[updatedMessages.length - 1];
                if (lastMsg && lastMsg.type === 'bot' && lastMsg.isTyping) {
                  lastMsg.text = fullText.substring(0, currentIndex + 1);
                  // Allow user to scroll freely during typing - don't force auto-scroll
                  // Only auto-scroll if user is at the very bottom (within 5px)
                  const chatContainer = document.querySelector('.chat-messages');
                  if (chatContainer) {
                    const isAtBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 5;
                    if (isAtBottom) {
                      setShouldScrollToBottom(true);
                    }
                  }
                }
                return updatedMessages;
              });
              currentIndex++;
              
              // Random typing speed between 20-50ms for natural feel
              const typingSpeed = Math.random() * 30 + 20;
              setTimeout(typeNextChar, typingSpeed);
            } else {
              // Animation complete - mark as not typing
              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                const lastMsg = updatedMessages[updatedMessages.length - 1];
                if (lastMsg && lastMsg.type === 'bot' && lastMsg.isTyping) {
                  lastMsg.isTyping = false;
                  lastMsg.text = fullText;
                }
                return updatedMessages;
              });
            }
          };
          
          // Start typing animation
          setTimeout(typeNextChar, 100);
        }
        return m;
      });
    }, 100);

    // 6) Update suggestions if provided
    if (Array.isArray(newSugs) && newSugs.length > 0) setSuggestions(newSugs);

    setLoading(false);
    // Don't force focus - let user control the input

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
            <div className={`chatbot-bubble ${isExciting ? 'exciting' : ''}`} onClick={() => {
              setMinimized(false);
              // Reset unread count when chat is opened
              setUnreadCount(0);
              setLastReadMessageIndex(messages.length - 1);
              // Check cart once when widget opens
              checkCart();
            }}>
              <span className="bubble-icon" role="img" aria-label="shopping bag">👩🏾</span>
              <span className="bubble-text">{bubbleText}</span>
              {/* Notification badge */}
              {unreadCount > 0 && (
                <div className="notification-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
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
          <div className="chat-messages" ref={chatContainerRef}>
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
              
              // Check if this is the last unread message (for red border indicator)
              const isLastUnread = i === lastReadMessageIndex + 1 && i < messages.length - 1;
              
              return (
                <div key={i}
                  className={`chat-message ${msg.type}${msg.isTyping ? ' typing' : ''}${bounce ? ' bounce' : ''}${isLastUser ? ' glow' : ''}${isLastUnread ? ' unread' : ''}`}>
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
                    {msg.type === 'bot' && !msg.isTyping && (msg.answer || msg.text) && (
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
                              {children}
                            </a>
                          )
                        }}
                      >
                        {msg.answer || msg.text}
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
                    {/* Product results removed - AI will mention products naturally in its response */}
                    {msg.time && !msg.isTyping && <div className="timestamp">{msg.time}</div>}
                  </div>
                </div>
              );
            })}
            

            
            <div ref={endRef} />
          </div>
          
          {/* Scroll to bottom button */}
          {userScrolledUp && (
            <button 
              className="scroll-to-bottom-btn"
              onClick={() => {
                endRef.current?.scrollIntoView({ behavior: 'smooth' });
                setUserScrolledUp(false);
              }}
              title="Scroll to bottom"
            >
              ↓
            </button>
          )}
          {/* Show suggestions as clickable buttons after every bot response if suggestions are present */}
          {messages.length > 0 && messages[messages.length-1].type === 'bot' && messages[messages.length-1].suggestions && messages[messages.length-1].suggestions.length > 0 && (
            <div className="suggestions-container suggestions-vertical">
              {messages[messages.length-1].suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  className={`suggestion-btn${selectedSuggestion === i ? ' selected' : ''}`}
                  onClick={() => { setSelectedSuggestion(i); sendMessage(s); }}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {/* Only show initial suggestions at the start, before any user message */}
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