const chalk = require('chalk');

const ts = () => new Date().toISOString();

const logger = {
  info: (msg) => console.log(chalk.blue(`[${ts()}] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[${ts()}] ${msg}`)),
  error: (msg) => console.log(chalk.red(`[${ts()}] ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`[${ts()}] ${msg}`)),
  debug: (msg) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(chalk.gray(`[${ts()}] [DEBUG] ${msg}`));
    }
  },
};

module.exports = logger;
