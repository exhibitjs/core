import chalk from 'chalk';
import cc from 'cli-color';

const colours = {
  red     : cc.xtermSupported ? cc.xterm(203) : chalk.red,
  grey    : cc.xtermSupported ? cc.xterm(241) : chalk.grey,
  green   : cc.xtermSupported ? cc.xterm(48)  : chalk.green,
  orange  : cc.xtermSupported ? cc.xterm(173) : chalk.yellow,
  cyan    : cc.xtermSupported ? cc.xterm(116) : chalk.cyan,
  magenta : cc.xtermSupported ? cc.xterm(169) : chalk.magenta,
  purple  : cc.xtermSupported ? cc.xterm(57)  : chalk.blue,
  yellow  : chalk.yellow,
};

export default colours;
