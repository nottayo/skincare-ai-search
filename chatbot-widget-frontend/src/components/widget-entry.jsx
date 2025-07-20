import React from 'react';
import { createRoot } from 'react-dom/client';
import Chatbot from './Chatbot';

window.renderMamaTegaChatbot = function(targetId = 'ChatbotWidget') {
  const container = document.getElementById(targetId);
  if (container) {
    createRoot(container).render(<Chatbot />);
  }
}; 



