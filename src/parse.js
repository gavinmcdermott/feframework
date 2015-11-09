'use strict';

var _ = require('lodash');

// Abstract syntax tree marker constants to identify nodes being represented
var AST_MARKER = {
  PROGRAM: 'Program',
  LITERAL: 'Literal'
};

// 
var ESCAPES = {
  'n': '\n',
  'f': '\f', 
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"',
};

// Responsible for the actual tokenization of an expression
function Lexer() {

}

Lexer.prototype.peek = function() {
  return (this.index < this.text.length - 1) ?
          this.text.charAt(this.index + 1) :
          false;
};

Lexer.prototype.isExponentOperator = function(ch) {
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isNumber = function(ch) {
  return ('0' <= ch) && (ch <= '9');
};

Lexer.prototype.readNumber = function() {
  var number = '';

  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index).toLowerCase();
    // allow decimals 
    if (ch === '.' || this.isNumber(ch)) {
      number += ch;
    } else {
      // handle scientific notation parsing
      var nextCh = this.peek();
      var prevCh = number.charAt(number.length - 1);

      if (ch === 'e' && this.isExponentOperator(nextCh)) {
        number += ch;

      } else if ( this.isExponentOperator(ch) &&
                  prevCh === 'e' &&
                  nextCh &&
                  this.isNumber(nextCh)) {
        number += ch;

      } else if ( this.isExponentOperator(ch) &&
                  prevCh === 'e' &&
                  (!nextCh || !this.isNumber(nextCh))) {
        throw new Error('Invalid exponenet');

      } else {
        break;
      }
    }
    this.index++;
  }

  // emit a valid token after parsing a number
  this.tokens.push({
    text: number,
    value: Number(number)
  });
};

Lexer.prototype.readString = function(quote) {
  this.index++; // increment past the opening quote character
  var string = '';
  var escape = false;

  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    
    if (escape) {
      if (ch === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5);
        this.index += 4;
        string += String.fromCharCode(parseInt(hex, 16));
      } else {
        var replacement = ESCAPES[ch];
        if (replacement) {
          string += replacement;
        } else {
          string += ch;
        }
      }
      // be sure to flip the escape boolean back :)
      escape = false;
    } else if (ch === quote) {
      // ensure the closing quote matches the opening
      // emit a valid token after parsing the string
      this.index++;
      this.tokens.push({
        text: string,
        value: string
      });
      return;
    } else if (ch === '\\') {
      // flip this boolean so that we handle escape chars on
      // the next iteration
      escape = true;
    } else {
      string += ch;
    }
    this.index++;
  }

  throw new Error('Unmatched quote');
};

// Tokens give the AST Builder the information it needs to construct
// an abstract syntax tree
Lexer.prototype.lex = function(text) {
  // incoming text string
  this.text = text;
  // index of the string we're currently parsing
  this.index = 0;
  // current character of the string
  this.ch = undefined;
  // array of tokens we'll return to the AST builder
  this.tokens = [];

  // tokenize the input text
  while (this.index < this.text.length) {
    this.ch = this.text.charAt(this.index);

    // behavior for dealing with different inputs
    // Numbers (allow them to begin with a decimal if numbers follow)
    if (  this.isNumber(this.ch) ||
          (this.ch === '.' && this.isNumber(this.peek() ) ) ) {
      this.readNumber();

    // Strings
    } else if (this.ch === '\'' || this.ch === '"') { 
      this.readString(this.ch);

    } else {
      throw new Error('Unexpected next character: ', this.ch);
    }
  }

  return this.tokens;
};







function AST(lexer) {
  this.lexer = lexer;
}

AST.prototype.constant = function() {
  return {
    type: AST_MARKER.LITERAL,
    value: this.tokens[0].value
  };
};

AST.prototype.program = function() {
  return {
    type: AST_MARKER.PROGRAM,
    body: this.constant()
  };
};

AST.prototype.ast = function(text) {
  this.tokens = this.lexer.lex(text);

  // build the AST
  return this.program();
};






function ASTCompiler(astBuilder) {
  this.astBuilder = astBuilder;
}

// escape for any characters other than spaces or alphanumeric chars
ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

// replace a character with the valid unicode equivalent
ASTCompiler.prototype.stringEscapeFn = function(c) {
  return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};

// put quotes around a string value
ASTCompiler.prototype.escape = function(value) {
  if (_.isString(value)) {
    return '\'' +
      value.replace(this.stringEscapeRegex, this.stringEscapeFn) +
      '\'';
  } else {
    return value;
  }
};

ASTCompiler.prototype.recurse = function(ast) {
  // as we recurse into this function, the program doesn't have any value
  // however, the deeper we get into the AST, we handle the values in here
  switch (ast.type) {
    
    case AST_MARKER.PROGRAM:
      // in this case we generate the return statement
      // for the entire expression
      this.state.body.push('return ', this.recurse(ast.body), ';');
      break;

    case AST_MARKER.LITERAL:
      // literals have no child nodes, it is just a value - return it :)
      return this.escape(ast.value);
  }
};

ASTCompiler.prototype.compile = function(text) {
  // compile the AST into a useful javascript function
  var ast = this.astBuilder.ast(text);
  this.state = {
    body: []
  };

  // build the javascript statements (in the body of the above obj)
  // from which we can create/build a valid JS function
  this.recurse(ast);

  /* jshint -W054 */
  // we take some JS source code and compile it into a function on the fly
  // (basically a form of eval -- so we kill the warnings)
  return new Function(this.state.body.join(''));
  /* jshint -W054 */
};






// this function constructs the complete parsing pipeline from all pieces above
function Parser (lexer) {
  this.lexer = lexer;
  this.ast = new AST(this.lexer);
  this.astCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function(text) {
  return this.astCompiler.compile(text);
};







// only external facing function that takes an expression and
// executes it in a certain context - works through the use of our
// Lexer, AST Builder, AST Compiler, and Parser
function parse(text) {
  var lexer = new Lexer();
  var parser = new Parser(lexer);
  return parser.parse(text);
}










module.exports = parse;









