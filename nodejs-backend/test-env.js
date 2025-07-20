require('dotenv').config();
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]');
console.log('TEST_VAR:', process.env.TEST_VAR || '[NOT SET]'); 


