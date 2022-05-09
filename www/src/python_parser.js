(function($B){

var _b_ = $B.builtins,
    grammar = $B.grammar,
    Store = new $B.ast.Store(),
    Load = new $B.ast.Load(),
    Del = new $B.ast.Del(),
    NULL = undefined

// Set variables used in grammar actions such as Add, Not, etc.
for(var op_type of $B.op_types){
    for(var key in op_type){
        var klass_name = op_type[key]
        eval(`var ${klass_name} = new $B.ast.${klass_name}()`)
    }
}

var debug = 0

var alias_ty = $B.ast.alias,
    keyword_ty = $B.ast.keyword,
    arguments_ty = $B.ast.arguments,
    expr_ty = $B.ast.expr,
    asdl_stmt_seq = Array,
    asdl_int_seq = Array,
    asdl_expr_seq = Array,
    asdl_keyword_seq = Array,
    asdl_identifier_seq = Array,
    asdl_pattern_seq = Array,
    AugOperator = $B.ast.AugAssign,
    Py_Ellipsis = {type: 'ellipsis'},
    Py_False = false,
    Py_True = true,
    Py_None = _b_.None,
    PyExc_SyntaxError = _b_.SyntaxError

var PyPARSE_IGNORE_COOKIE = 0x0010,
    PyPARSE_BARRY_AS_BDFL = 0x0020,
    PyPARSE_TYPE_COMMENTS = 0x0040,
    PyPARSE_ASYNC_HACKS = 0x0080,
    PyPARSE_ALLOW_INCOMPLETE_INPUT = 0x0100

var STAR_TARGETS = 'star_targets',
    FOR_TARGETS = 'for_targets',
    DEL_TARGETS = 'del_targets'

for(var rule_name in grammar){
    grammar[rule_name].name = rule_name
    if(grammar[rule_name].choices){
        grammar[rule_name].choices.forEach(function(item, rank){
            item.parent_rule = rule_name
            item.rank = rank
        })
    }
}

// Generate functions to create AST instances
$B._PyAST = {}

var template = `
$B._PyAST.<ast_class> = function(<args><sep>EXTRA){
    var ast_obj = new $B.ast.<ast_class>(<args>)
    set_position_from_EXTRA(ast_obj, EXTRA)
    return ast_obj
}
`

for(var ast_class in $B.ast_classes){ // in py_ast.js
    var args = $B.ast_classes[ast_class]
    if(Array.isArray(args)){
        continue
    }
    args = args.replace(/\*/g, '')
    var sep = args.length > 0 ? ', ' : ''
    var function_code = template.replace(/<ast_class>/g, ast_class)
                                .replace(/<sep>/, sep)
                                .replace(/<args>/g, args)
    eval(function_code)
}

function generator_as_list(generator){
    // Returns an object that has the interface of a list and consumes the
    // generator on demand, if the index was not yet read.
    return new Proxy(generator,
      {
        get: function(target, ix){
            if(ix == 'last'){
                return $B.last(this.tokens)
            }
          if(this.tokens === undefined){
              this.tokens = []
          }
          if(ix >= this.tokens.length){
              while(true){
                  var next = target.next()
                  if(! next.done){
                      var value = next.value
                      if(['ENCODING', 'NL', 'COMMENT'].indexOf(value.type) == -1){
                          this.tokens.push(value)
                          break
                      }
                  }else{
                      throw Error('tokenizer exhausted')
                  }
              }
          }
          return this.tokens[ix]
        }
      }
    )
}

var Parser = $B.Parser = function(src, filename){
    // Normalize line ends
    src = src.replace(/\r\n/gm, "\n")
    // Remove trailing \, cf issue 970
    // but don't hide syntax error if ends with \\, cf issue 1210
    if(src.endsWith("\\") && !src.endsWith("\\\\")){
        src = src.substr(0, src.length - 1)
    }
    // Normalise script end
    if(src.charAt(src.length - 1) != "\n"){
        src += "\n"
    }

    var tokenizer = $B.tokenizer(src)
    this.tokens = generator_as_list(tokenizer)
    $B.parser_state.src = src
    this.src = src
    this.filename = filename
    if(filename){
        p.filename = filename
    }
}

Parser.prototype.feed = function(top_rule){
    return this.parse(top_rule)
}

Parser.prototype.parse = function(top_rule){
    if(this.src.trim().length == 0){
        // eg empty __init__.py
        return new $B.ast.Module([])
    }
    var rule = grammar[top_rule],
        match
    clear_memo()
    this.HEADS = {}
    this.LRStack = []
    // first pass skipping invalid_ rules
    use_invalid.value = false
    match = this.apply_rule(rule, 0)
    if(match === FAIL){
        // second pass using invalid_ rules
        clear_memo()
        this.HEADS = {}
        this.LRStack = []
        use_invalid.value = true
        try{
            match = this.apply_rule(rule, 0)
        }catch(err){
            throw err
        }
    }
    if(match === FAIL){
        var err_token = this.tokens.last
        p.filename = this.filename
        RAISE_ERROR_KNOWN_LOCATION(p, _b_.SyntaxError,
            err_token.start[0],
            err_token.start[1],
            err_token.end[0],
            err_token.end[1],
            'invalid syntax')
    }

    var _ast = make(match, this.tokens)
    return _ast
}

function asdl_seq_LEN(t){
    return t.length
}

function asdl_seq_GET(t, i){
    return t[i]
}

function CHECK(type, obj){
    if(Array.isArray(type)){
        var check
        for(var t of type){
            check = CHECK(t, obj)
            if(check){
                return check
            }
        }
        return undefined
    }
    if(obj instanceof type){
        return obj
    }
    return undefined
}

function CHECK_VERSION(type, version, msg, node){
    return INVALID_VERSION_CHECK(p, version, msg, node)
}

function CHECK_NULL_ALLOWED(type, obj){
    if(obj !== NULL){
        if(type instanceof Array){
            for(var t of type){
                if(obj instanceof t){
                    return obj
                }
            }
            return
        }else{
            return obj instanceof type ? obj : undefined
        }
    }
    return obj
}

function INVALID_VERSION_CHECK(p, version, msg, node){
    if (node == NULL) {
        p.error_indicator = 1;  // Inline CHECK_CALL
        return NULL;
    }
    if (p.feature_version < version) {
        p.error_indicator = 1;
        return RAISE_SYNTAX_ERROR("%s only supported in Python 3.%i and greater",
                                  msg, version);
    }
    return node;
}

function NEW_TYPE_COMMENT(p, x){
    return x
}

function RAISE_ERROR_KNOWN_LOCATION(p, errtype,
                           lineno, col_offset,
                           end_lineno, end_col_offset,
                           errmsg){
    var va = [errmsg]
    $B._PyPegen.raise_error_known_location(p, errtype,
        lineno, col_offset, end_lineno, end_col_offset, errmsg, va);
    return NULL;
}

var RAISE_SYNTAX_ERROR = $B.Parser.RAISE_SYNTAX_ERROR = function(msg){
    var extra_args = []
    for(var i = 1, len = arguments.length; i < len; i++){
        extra_args.push(arguments[i])
    }
    $B._PyPegen.raise_error(p, _b_.SyntaxError, msg, ...extra_args)
}

var RAISE_INDENTATION_ERROR = function(msg, arg){
    if(arg !== undefined){
        msg = _b_.str.__mod__(msg, arg)
    }
    $B._PyPegen.raise_error(p, _b_.IndentationError, msg)
}

var RAISE_SYNTAX_ERROR_KNOWN_LOCATION =
        $B.Parser.RAISE_SYNTAX_ERROR_KNOWN_LOCATION = function(a, err_msg, arg){
    if(arg !== undefined){
        err_msg = _b_.str.__mod__(err_msg, arg)
    }

    RAISE_ERROR_KNOWN_LOCATION(p, _b_.SyntaxError,
        a.lineno, a.col_offset,
        a.end_lineno, a.end_col_offset,
        err_msg)
}

$B.Parser.RAISE_ERROR_KNOWN_LOCATION = RAISE_ERROR_KNOWN_LOCATION

function RAISE_SYNTAX_ERROR_KNOWN_RANGE(a, b, msg){
    var extra_args = arguments[3]
    RAISE_ERROR_KNOWN_LOCATION(p, _b_.SyntaxError,
        a.lineno, a.col_offset,
        b.end_lineno, b.end_col_offset,
        msg, extra_args)
}

function RAISE_SYNTAX_ERROR_INVALID_TARGET(type, e){
    return _RAISE_SYNTAX_ERROR_INVALID_TARGET(p, type, e)
}

function _RAISE_SYNTAX_ERROR_INVALID_TARGET(p, type, e){
    var invalid_target = CHECK_NULL_ALLOWED(expr_ty, $B._PyPegen.get_invalid_target(e, type));
    if (invalid_target != NULL) {
        var msg;
        if (type == STAR_TARGETS || type == FOR_TARGETS) {
            msg = "cannot assign to %s";
        }else{
            msg = "cannot delete %s";
        }
        return RAISE_SYNTAX_ERROR_KNOWN_LOCATION(
            invalid_target,
            msg,
            $B._PyPegen.get_expr_name(invalid_target)
        )
    }
    return NULL;
}

function set_position_from_EXTRA(ast_obj, EXTRA){
    for(var key in EXTRA){
        ast_obj[key] = EXTRA[key]
    }
}

var inf = Number.POSITIVE_INFINITY

// Python keywords don't match NAME rules, so that "pass = 7" is illegal
// The list doesn't include 'case' and 'match' that are 'soft keywords'
// in PEP 634
var keywords = ['and', 'as', 'elif', 'for', 'yield', 'while', 'assert', 'or',
    'continue', 'lambda', 'from', 'class', 'in', 'not', 'finally', 'is',
    'except', 'global', 'return', 'raise', 'break', 'with', 'def',
    'try', 'if', 'else', 'del', 'import', 'nonlocal', 'pass'
    ]


function MemoEntry(match, end){
    this.match = match
    this.position = end
}

var memo = {},
    rules = {}

function clear_memo(){
    for(var key in memo){
        delete memo[key]
    }
}

function get_memo(rule, position){
    if(memo[rule.name] === undefined ||
            memo[rule.name][position] === undefined){
        return null
    }
    var m = memo[rule.name][position]
    if(m.match === FAIL){
        return FAIL
    }
    return m
}

function set_memo(rule, position, value){
    memo[rule.name] = memo[rule.name] || {}
    memo[rule.name][position] = value
}

var FAIL = {name: 'FAIL'},
    FROZEN_FAIL = {name: 'FROZEN_FAIL'}

function LeftRecursion(detected){
    this.type = 'LeftRecursion'
    this.detected = detected // true or false
}

function LR(seed, rule){
    this.seed = seed
    this.rule = rule
}

Parser.prototype.eval_option = function(rule, position){
    var tokens = this.tokens,
        result,
        start = position,
        join_position = false

    this.current_rule = rule
    if(! rule.repeat){
        result = this.eval_option_once(rule, position)
    }else{
        var matches = [],
            start = position
        while(matches.length < rule.repeat[1]){
            var match = this.eval_option_once(rule, position)
            if(match === FAIL){
                if(join_position){
                    result = {rule, matches, start, end: join_position - 1}
                    join_position = false
                    position = join_position - 1
                }else if(matches.length >= rule.repeat[0]){
                    // Enough repetitions
                    result = {rule, matches, start, end: position}
                }else{
                    result = FAIL
                }
                break
            }
            matches.push(match)
            // If the rule is of the form "s.e" :
            // - if the next token matches "s", increment position and remain
            //   in the loop. Keep track of the position that matches "s". If
            //   the next tokens don't match the rule, the position will be
            //   reset to the position of the "s" character
            // - else break
            if(rule.join){
                if(tokens[match.end][1] == rule.join){
                    position = match.end + 1
                    join_position = position
                }else{
                    position = match.end
                    break
                }
             }else{
                 join_position = false
                 position = match.end
             }
        }
        if(! result){
            result = {rule, start, matches, end: position}
        }
    }
    if(rule.lookahead){
        switch(rule.lookahead){
            case 'positive':
                if(result !== FAIL){
                    result.end = result.start // don't consume input
                }
                break
            case 'negative':
                if(result === FAIL){
                    result = {rule, start, end: start}
                }else{
                    result = FAIL
                }
                break
        }
    }
    return result
}

var use_invalid = {value: false}

Parser.prototype.eval_option_once = function(rule, position){
    var tokens = this.tokens
    if(rule.choices){
        for(var i = 0, len = rule.choices.length; i < len; i++){
            var choice = rule.choices[i],
                invalid = choice.items && choice.items.length == 1 &&
                    choice.items[0].name &&
                    choice.items[0].name.startsWith('invalid_')
            if(invalid && ! use_invalid.value){
                continue
            }
            stack.push('#' + i)
            var match = this.eval_option(choice, position)
            if(match === FROZEN_FAIL){
                // if a choice with a ~ fails, don't try other alternatives
                stack.pop()
                return FAIL
            }else if(match !== FAIL){
                if(invalid){
                    var _ast = handle_invalid_match(match, tokens)
                    if(_ast === undefined){
                        console.log('invalid match returns undefined', show_rule(rule))
                        return FAIL
                    }
                    match.invalid = true
                }
                match.rank = i
                stack.pop()
                return match
            }
            stack.pop()
        }
        return FAIL
    }else if(rule.items){
        var start = position,
            matches = [],
            frozen_choice = false // set to true if we reach a COMMIT_CHOICE (~)
        for(var item of rule.items){
            if(item.type == 'COMMIT_CHOICE'){
                frozen_choice = true
            }
            var match = this.eval_option(item, position)
            if(match === undefined){
                console.log('eval of item', item, 'returns undef')
            }
            if(match !== FAIL){
                matches.push(match)
                position = match.end
            }else{
                if(frozen_choice){
                    return FROZEN_FAIL
                }
                return FAIL
            }
        }
        var match = {rule, matches, start, end: position}
        if(use_invalid.value && rule.parent_rule &&
                rule.parent_rule.startsWith('invalid_')){
            var _ast = handle_invalid_match(match, tokens)
            if(_ast === undefined){
                return FAIL
            }
            match.invalid = true
        }
        return match
    }else if(rule.type == "rule"){
        return this.apply_rule(grammar[rule.name], position)
    }else if(rule.type == "string"){
        return tokens[position][1] == rule.value ?
            {rule, start: position, end: position + 1} :
            FAIL
    }else if(rule.type == 'COMMIT_CHOICE'){
        // mark current option as frozen
        return {rule, start: position, end: position}
    }else if(rule.type == 'NAME'){
        var token = tokens[position],
            string = token.string,
            test = token.type == rule.type &&
            keywords.indexOf(token.string) == -1 &&
            ['True', 'False', 'None'].indexOf(token.string) == -1 &&
            (rule.value === undefined ? true : tokens[position][1] == rule.value)
        return test ? {rule, start: position, end: position + 1} : FAIL
    }else if(rule.type == 'ASYNC'){
        var test = tokens[position].type == 'NAME' && tokens[position].string == 'async'
        return test ? {rule, start: position, end: position + 1} : FAIL
    }else if(rule.type == 'AWAIT'){
        var test = tokens[position].type == 'NAME' && tokens[position].string == 'await'
        return test ? {rule, start: position, end: position + 1} : FAIL
    }else{
        var test = tokens[position][0] == rule.type &&
          (rule.value === undefined ? true : tokens[position][1] == rule.value)
        return test ? {rule, start: position, end: position + 1} : FAIL
    }
}

Parser.prototype.eval_body = function(rule, position){
    this.current_rule = rule
    // Only for grammar rules
    var start = position
    if(rule.choices){
        for(var i = 0, len = rule.choices.length; i < len; i++){
            var choice = rule.choices[i],
                invalid = choice.items && choice.items.length == 1 &&
                    choice.items[0].name &&
                    choice.items[0].name.startsWith('invalid_')
            if(invalid && ! use_invalid.value){
                continue
            }
            var match = this.eval_option(choice, position)
            if(match === FROZEN_FAIL){
                // if a choice with a ~ fails, don't try other alternatives
                return FAIL
            }else if(match !== FAIL){
                if(invalid){
                    var _ast = handle_invalid_match(match, this.tokens)
                    if(_ast === undefined){
                        // ignore invalid match if its action returns NULL
                        continue
                    }
                }
                match.rank = i
                return match
            }
        }
        return FAIL
    }else if(rule.items){
        var matches = [],
            frozen_choice = false // set to true if we reach a COMMIT_CHOICE (~)
        for(var item of rule.items){
            if(item.type == 'COMMIT_CHOICE'){
                frozen_choice = true
            }
            var match = this.eval_option(item, position)
            if(match !== FAIL){
                matches.push(match)
                position = match.end
            }else{
                if(frozen_choice){
                    return FROZEN_FAIL
                }
                return FAIL
            }
        }
        var match = {rule, matches, start, end: position}
        if(use_invalid.value && rule.parent_rule &&
                rule.parent_rule.startsWith('invalid_')){
            handle_invalid_match(match, this.tokens)
        }
        return match
    }
}

Parser.prototype.matched_string = function(match){
    var s = ''
    for(var i = match.start; i < match.end; i++){
        s += this.tokens[i].string
    }
    return s
}

function HEAD(rule, involvedSet, evalSet){
    this.rule = rule
    this.involvedSet = involvedSet
    this.evalSet = evalSet
}

Parser.prototype.RECALL = function(R, P){
    let m = get_memo(R, P)
    let h = this.HEADS[P]
    // If not growing a seed parse, just return what is stored
    // in the memo table.
    if(! h){
        return m
    }
    // Do not evaluate any rule that is not involved in this
    // left recursion.
    var set = new Set([h.head])
    for(var s of h.involvedSet){
        set.add(s)
    }
    if((! m) && ! set.has(R)){
        return new MemoEntry(FAIL, P)
    }
    // Allow involved rules to be evaluated, but only once,
    // during a seed-growing iteration.
    if(h.evalSet.has(R)){
        h.evalSet.delete(R)
        let ans = this.eval_body(R, P)
        m.match = ans
        m.end = ans === FAIL ? P : ans.end
    }
    return m
}

Parser.prototype.SETUP_LR = function(R, L){
    if(! L.head){
        L.head = new HEAD(R, new Set(), new Set())
    }
    let ix = this.LRStack.length -1,
        s = this.LRStack[ix]
    while(s && s.head !== L.head){
        s.head = L.head
        L.head.involvedSet.add(s.rule)
        ix--
        s = this.LRStack[ix]
    }
}

Parser.prototype.LR_ANSWER = function(R, P, M){
    let h = M.match.head
    if(h.rule != R){
        return M.match.seed
    }else{
        M.match = M.match.seed
    }
    if(M.match === FAIL){
        return FAIL
    }else{
        return this.grow_lr(R, P, M, h)
    }
}

Parser.prototype.grow_lr = function(rule, position, m, H){
    // Called after eval_body(rule, position) produced a match and ignored
    // an option that referenced itself (recursion) because at that time,
    // memo(rule, position) was a LeftReference.
    //
    // m is the MemoEntry for (rule, position); m.match is the latest match,
    // m.pos is the last position in tokens
    //
    // apply_rule(rule, position) will return this match
    //
    // In each iteration of the "while" loop, we try again eval_body(),
    // which uses the MemoEntry m for the rule. This allows an
    // expression such as "1 + 2 + 3" to set a first match for "1 + 2",
    // then a second for "1 + 2 + 3"
    this.HEADS[position] = H
    while(true){
        if(H){
            H.evalSet = new Set(H.involvedSet)
        }
        var match = this.eval_body(rule, position)
        if(match === FAIL || match.end <= m.end){
            break
        }
        m.match = match
        m.end = match.end
    }
    delete this.HEADS[position]
    return m.match
}

var stack = []

Parser.prototype.apply_rule = function(rule, position){
    // apply rule at position
    // search if result is in memo
    this.current_rule = rule
    stack.push(rule.name)
    var memoized = this.RECALL(rule, position),
        result
    if(memoized === null){
        // for left recursion, initialize with LeftRecursion set to false
        var lr = new LR(FAIL, rule)
        this.LRStack.push(lr)
        var m = new MemoEntry(lr, position)
        set_memo(rule, position, m)
        // evaluate body of rule
        // if the rule includes itself at the same position, it will be found
        // in memo as LR; LR.detected will be set to true and the branch of
        // eval_body containing rule will return FAIL, but eval_body can
        // match with another branch that doesn't contain rule
        var match = this.eval_body(rule, position)
        this.LRStack.pop()

        // change memo(rule, position) with result of match
        // m.match = match
        m.end = match.end

        if(lr.head){
            lr.seed = match
            result = this.LR_ANSWER(rule, position, m)
        }else{
            m.match = match
            result = match
        }
    }else{
        if(memoized.match instanceof LR){
            this.SETUP_LR(rule, memoized.match)
            result = memoized.match.seed
        }else{
            result = memoized === FAIL ? memoized : memoized.match
        }
    }
    stack.pop()
    return result
}

$B.parser_state = {}

function handle_invalid_match(match, tokens){
    var res = make(match, tokens)
}

function show(match, tokens, level){
    level = level || 0
    var s = '',
        prefix = '  '.repeat(level),
        rule = match.rule

    s += prefix + show_rule(rule)
    if(match.matches){
        s += ' (' + match.matches.length + ' matches'
        for(var m of match.matches){
            if(m.rule === rule){
                s += ' same rule ' + show_rule(m.rule)
            }
        }
        s += ')'
    }

    s += '\n'
    if(! match.rule.repeat){
        level += 1
    }

    if(match.matches){
        for(var m of match.matches){
            s += show(m, tokens, level)
        }
    }else{
        if(match.end > match.start){
            s += prefix
            if(['NAME', 'STRING', 'NUMBER', 'string'].indexOf(match.rule.type) > -1){
                s += match.rule.type + ' ' + tokens[match.start][1]
            }else{
                s += match.rule.type + ' ' + (match.rule.value || '') +
                    match.start + '-' + match.end
            }
            s += '\n'
        }
    }
    return s
}

function debug_head(n){
    var signs = '|:.',
        s = ''
    for(var i = 0; i < n; i++){
        s += '| '
    }
    return s
}

function show_rule(rule, show_action){
    var res = rule.name || ''
    if(rule.type && rule.type != 'rule'){
        if(rule.lookahead == 'positive'){
            res += '&'
        }else if(rule.lookahead == 'negative'){
            res += '!'
        }
        if(rule.type == 'string'){
            res += "'" + rule.value + "'"
        }else{
            res += rule.type
        }
    }

    if(rule.choices){
        res += ' (' + rule.choices.map(show_rule).join(' | ') + ')'
    }else if(rule.items){
        res += ' ' + rule.items.map(show_rule).join(' ')
    }

    if(rule.action && show_action){
        res += ' {' + rule.action + '}'
    }

    if(rule.repeat){
        if(rule.items && rule.items.length > 1){
            res = '(' + res + ')'
        }
        if(rule.repeat[0] == 0 && rule.repeat[1] == 1){
            res += '?'
        }else if(rule.repeat[0] == 0 && rule.repeat[1] == Number.POSITIVE_INFINITY){
            res += '*'
        }else if(rule.repeat[0] == 1 && rule.repeat[1] == Number.POSITIVE_INFINITY){
            res += '+'
        }
    }
    if(rule.join){
        res = `'${rule.join}'.` + res
    }
    if(rule.alias){
        res = (rule.alias + '=' + res)
    }
    if(rule.parent_rule){
        res = '<' + rule.parent_rule +' #' + rule.rank +'>' + res
    }
    return res
}

// Global parser object
var p = {feature_version: $B.version_info[1]}

function make(match, tokens){
    // match.rule succeeds; make() returns a value for the match, based on the
    // grammar action for the rule
    var rule = match.rule,
        names = {}
    p.tokens = tokens
    p.mark = match.start
    p.fill = match.start

    var invalid_rule = show_rule(rule).search('invalid_') > -1

    var test = false // show_rule(rule).indexOf('star_expressions') > -1
    if(test){
        console.log('make', show_rule(rule, true), '\n    match', match)
    }

    if(! rule){
        console.log('match without rule', match)
    }

    /* console.log('make, rule', show_rule(rule),
        (match.matches ? match.matches.length + ' matches' : match)) */

    if(match.end > match.start){
        var token = tokens[match.start],
            EXTRA = {lineno: token.start[0],
                     col_offset: token.start[1],
                     end_lineno: token.end[0],
                     end_col_offset: token.end[1]
                     }
        p.arena = EXTRA
    }

    if(rule.repeat){
        // If a repeated rule has an alias, it applies to the repetition list
        // The number of repetitions is len(match.matches)
        var res = []
        if(['STRING', 'string', 'NEWLINE'].indexOf(rule.type) > -1){
            for(var m of match.matches){
                res.push(tokens[m.start])
            }
            if(rule.alias){
                eval('var ' + rule.alias + ' = res')
            }
            if(rule.action){
                if(test){
                    console.log('eval action of', show_rule(rule, true))
                }
                return eval(rule.action)
            }
            return res
        }else if(rule.type == 'NAME'){
            for(var m of match.matches){
                res.push(new $B.ast.Name(tokens[m.start].string,
                    new $B.ast.Load()))
            }
            if(rule.alias){
                eval('var ' + rule.alias + ' = res')
            }
            if(rule.action){
                return eval(rule.action)
            }
            return res
        }
        var makes = []
        for(var one_match of match.matches){
            // Each of the matches matches rule.items
            if(one_match.rule === rule){
                var elts = []
                if(! one_match.matches){
                    if(rule.repeat[1] == 1){
                        console.log('optional, match', one_match, 'repeat', rule.repeat)
                        var _make = make(one_match, tokens)
                        console.log('_make', _make)
                        alert()
                    }else{
                        console.log('one match no matches', match)
                    }
                }
                for(var i = 0; i < one_match.matches.length; i++){
                    var m = one_match.matches[i]
                    //if(m.end > m.start){
                        var _make = make(m, tokens)
                        if(rule.items[i].alias){
                            eval('var ' + rule.items[i].alias + ' = _make')
                        }
                        elts.push(_make)
                    //}
                }
                if(rule.action){
                    try{
                        makes.push(eval(rule.action))
                    }catch(err){
                        console.log('error eval action of', show_rule(rule), match)
                        throw err
                    }
                }else if(elts.length == 1){
                    makes.push(elts[0])
                }else{
                    makes.push(elts)
                }
            }else{
                makes.push(make(one_match, tokens))
            }
        }
        if(makes.length == 0){
            return
        }
        if(rule.repeat[1] == 1){
            //console.log('rule', show_rule(rule), 'evals to', makes[0])
            return makes[0]
        }
        //console.log('rule', show_rule(rule), 'evals to', makes)
        return makes
    }

    if(rule.items){
        if(rule.items.length != match.matches.length){
            alert('rule items and match.matches have different lengths')
        }
        var makes = [],
            nb_consuming = 0,
            ast,
            _make
        if(match.matches.length > 0){
            var first = match.matches[0],
                last = $B.last(match.matches)
            EXTRA = {
                    lineno: tokens[first.start].start[0],
                    col_offset: tokens[first.start].start[1],
                    end_lineno: tokens[last.end - 1].end[0],
                    end_col_offset: tokens[last.end - 1].end[1]
                    }
        }
        for(var i = 0; i < match.matches.length; i++){
            var m = match.matches[i]
            if(test){
                console.log('  match', i, m)
            }
            if(m.end > m.start){
                _make = make(m, tokens)
                if(_make === undefined && m.action){
                    console.log('_make undef avec m.end > m.start ???')
                    console.log(m)
                    alert()
                }
                makes.push(_make)
            }else{
                if(m.rule.repeat && m.rule.repeat[1] > 1){
                    // If m.rule has * or + modifier, return empty list
                    _make = []
                }else{
                    _make = undefined
                }
            }
            if(rule.items[i].alias){
                /*
                if(test && rule.items[i].alias == 'a' && _make === undefined){
                    console.log('rule #' + i, show_rule(rule.items[i]))
                    console.log('match #' + i, match.matches[i])
                    console.log('rule for match #' + i, show_rule(match.matches[i].rule),
                        match.matches[i].rule)
                    console.log('_make', _make)
                    console.log('set alias to undefined', rule.items[i].alias)
                    if(invalid_rule){
                        console.log('invalid rule', invalid_rule)
                        var token = tokens[match.matches[i].start]
                        _make = {lineno: token.start[0],
                                 col_offset: token.start[1],
                                 end_lineno: token.end[0],
                                 end_col_offset: token.end[1]
                                }
                    }
                    alert()
                }
                */
                names[rule.items[i].alias] = _make
                eval('var ' + rule.items[i].alias + ' = _make')
                if(test){
                    console.log('set alias', rule.items[i].alias,
                        'to', eval(rule.items[i].alias))
                }
            }
            if(! rule.items[i].lookahead){
                nb_consuming++
            }
        }
        if(rule.action){
            try{
                ast = eval(rule.action)
            }catch(err){
                var rule_str = show_rule(rule, true)
                if($B.debug > 1){
                    console.log('error eval action of', rule_str)
                    console.log('p', p)
                    console.log($B.frames_stack.slice())
                    console.log(err.message)
                    console.log(err.stack)
                }
                throw err
            }
        }else if(nb_consuming == 1){
            ast = makes[0]
        }else{
            ast = makes
        }
        return ast
    }else{
        if(match.matches){
            alert('rule without items has matches')
        }
        if(rule.type == 'NAME'){
            var ast_obj = new $B.ast.Name(tokens[match.start].string,
                                          new $B.ast.Load())
            set_position_from_EXTRA(ast_obj, EXTRA)
            return ast_obj
        }else if(rule.type == 'NUMBER'){
            try{
                var prepared = $B.prepare_number(token[1])
            }catch(err){
                RAISE_SYNTAX_ERROR_KNOWN_LOCATION(p.arena,
                    'wrong number %s', token[1])

            }
            var ast_obj = new $B.ast.Constant(prepared)
            ast_obj.type = prepared.type
            set_position_from_EXTRA(ast_obj, EXTRA)
            return ast_obj
        }else if(['STRING', 'string'].indexOf(rule.type) > -1){
            var ast_obj = new $B.ast.Constant(tokens[match.start].string)
            set_position_from_EXTRA(ast_obj, EXTRA)
            return ast_obj
        }else if(grammar[rule.name] === undefined){
            // ignore NEWLINE, DEDENT...
        }else{
            var grammar_rule = grammar[rule_name]
            console.log('apply grammar rule', show_rule(grammar_rule))
            console.log('    rule', grammar_rule)
            console.log('    match', match)
            var elts = []
            for(var m of match.matches){
                elts.push(make(m, tokens))
            }
            console.log('rule', show_rule(rule), 'evals to', elts)
            return elts
        }
    }
}

})(__BRYTHON__)