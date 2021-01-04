// Regular expression

var $B = __BRYTHON__,
    _b_ = $B.builtins

var MAXGROUPS = 2147483647

var is_word = {}
var word_gcs = ['Ll', 'Lu', 'Lm', 'Lt', 'Lo',
                'Nd',
                'Mc', 'Me', 'Mn',
                'Pc']
for(var word_gc of word_gcs){
    for(var cp in $B.unicode_tables[word_gc]){
        is_word[cp] = true
    }
}

var $error_2 = {
    $name: "error",
    $qualname: "error",
    $is_class: true,
    __module__: "re"
}

var error = $B.$class_constructor("error", $error_2,
    _b_.tuple.$factory([_b_.Exception]),["_b_.Exception"],[])
error.__doc__ = _b_.None
error.$factory = $B.$instance_creator(error)

function fail(message, pos){
    var err = error.$factory(message)
    err.pos = pos
    throw err
}

var Flag = $B.make_class("Flag",
    function(name, value){
        return {
            __class__: Flag,
            name,
            value
        }
    }
)

Flag.__index__ = function(self){
    return self.value
}

Flag.__eq__ = function(self, other){
    return self.value == other.value
}

Flag.__or__ = function(self, other){
    return Flag.$factory(`${self.name} ${other.name}`,
        self.value | other.value)
}

Flag.__str__ = function(self){
    if(self.value == 0){
        return "re.none"
    }
    var t = []
    for(var flag of 'iLmsuxa'){
        if(self.value & inline_flags[flag].value){
            t.push(inline_flags[flag].name)
        }
    }
    return 're.' + t.join(' ')
}

$B.set_func_names(Flag, "re")

var no_flag = {}

var BPattern = $B.make_class("Pattern",
    function(pattern){
        pattern.__class__ = BPattern
        return pattern
    }
)

BPattern.findall = function(self){
    return $module.findall.apply(null, arguments)
}

var gi = $B.make_class("GroupIndex",
    function(self){
        var res = $B.empty_dict()
        res.__class__ = gi
        for(var key in self.$groups){
            if(isNaN(parseInt(key))){
                res.$string_dict[key] = [self.$groups[key].num,
                    res.$version++]
            }
        }
        return res
    }
)
gi.__mro__ = [_b_.dict, _b_.object]
gi.__setitem__ = function(){
    throw _b_.TypeError.$factory("read only")
}

BPattern.groupindex = {
    __get__: function(self){
        return gi.$factory(self)
    }
}

BPattern.match = function(self, string){
    var $ = $B.args("match", 4,
                    {self: null, string: null, pos: null, endpos: null},
                    ["self", "string", "pos", "endpos"], arguments,
                    {pos: 0, endpos: _b_.None}, null, null)
    if($.endpos === _b_.None){
        $.endpos = $.string.length
    }
    var mo = match($.self, $.string, $.pos, no_flag, $.endpos)
    if(mo === false){
        return _b_.None
    }
    return BMatchObject.$factory(mo)
}

$B.set_func_names(BPattern, "re")

function Node(parent){
    this.parent = parent
    this.items = []
}

Node.prototype.add = function(item){
    this.items.push(item)
    item.parent = this
}

Node.prototype.fixed_length = function(){
    // Return the sum of items lengths if fixed, else undefined
    if(this.repeat){
        return undefined
    }
    var len = 0
    for(var item of this.items){
        if(item.fixed_length === undefined){
            console.log("pas de fixed length", item)
            alert()
        }
        var sublen = item.fixed_length()
        if(sublen === undefined){
            return undefined
        }
        len += sublen
    }
    return len
}

var BackReference = function(pos, type, value){
    // for "\number"
    this.name = "BackReference"
    this.pos = pos
    this.type = type // "name" or "num"
    this.value = value
    this.groups = []
}

BackReference.prototype.fixed_length = function(){
    // Return length of referenced group if it is fixed, else undefined
    if(this.repeat){
        return undefined
    }
    var group = this.get_group()
    if(group.fixed_length === undefined){
        console.log("group", group, "no fixed length")
        alert()
    }
    return group === undefined ? undefined : group.fixed_length()
}

BackReference.prototype.get_group = function(){
    var top = this.parent
    while(top.parent){
        top = top.parent
    }
    return top.$groups[this.value]
}

BackReference.prototype.match = function(string, pos){
    var group = this.get_group()
    if(group){
        // compare string codepoints starting at pos with the group codepoints
        var group_cps = group.item.match_codepoints
        for(var i = 0, len = group_cps.length; i < len; i++){
            if(group_cps[i] != string.codepoints[pos + i]){
                return false
            }
        }
        var cps = group_cps.slice()
        for(var group of this.groups){
            group.match_codepoints = group.match_codepoints.concat(cps)
        }
        return cps
    }
    return false
}

var Case = function(){
    this.name = "Case"
    this.items = []
}

Case.prototype.add = Node.prototype.add

var Choice = function(){
    this.type = "choice"
    this.items = []
    this.groups = []
}

Case.prototype.fixed_length = function(){
    // Return sum of items lengths if they are fixed, else undefined
    var len = 0
    for(var item of this.items){
        var sublen = item.fixed_length()
        if(sublen === undefined){
            return undefined
        }
        len += sublen
    }
    return len
}

Choice.prototype.add = Node.prototype.add

Choice.prototype.fixed_length = function(){
    // Return a length if all options have the same fixed_length, otherwise
    // return undefined
    var len
    for(var _case of this.items){
        var sublen = _case.fixed_length()
        if(sublen === undefined){
            return undefined
        }
        if(len === undefined){
            len = sublen
        }else if(sublen != len){
            return undefined
        }
    }
    return len
}

var EmptyString = {
        toString: function(){
            return ''
        },
        length: 0
    },
    Flags = function(flags){
        this.flags = flags
    },
    GroupEnd = function(pos){
        this.name = "GroupEnd",
        this.pos = pos
    },
    Or = function(pos){
        this.name = "Or"
        this.pos = pos
    },
    Repeater = function(pos, op, greedy){
        this.name = "Repeater"
        this.pos = pos
        this.op = op
        this.greedy = greedy !== undefined
    }


var Char = function(pos, char, groups){
    // character in a regular expression or in a character set
    // pos : position of the character in the pattern string
    // char : the character
    // groups (optional) : the groups that contain the character
    this.pos = pos
    this.char = char
    try{
        if(! char.items && char !== EmptyString && ! char.character_class){
            this.ord = _b_.ord(char)
        }
    }catch(err){
        console.log("no ord", char)
        throw err
    }
    this.match_codepoints = []
    this.nb_success = 0
    this.groups = []
    if(groups){
        for(var group of groups){
            this.groups.push(group)
            group.chars.push(this)
        }
    }
}

Char.prototype.fixed_length = function(){
    if(this.repeat){
        return undefined
    }
    return this.char === EmptyString ? 0 : 1
}

Char.prototype.match = function(string, pos){
    // console.log("char match", this, string.codepoints[pos])
    if(this.repeat){
        if(this.repeat.op == "?" && this.str.length == 1){
            return false
        }else if(this.repeat.op.start){
            console.log(this.repeat.op)
        }
    }
    var test = false
    var cp = string.codepoints[pos]

    if(cp === undefined && this.char !== EmptyString){
        // end of string matches $
        // if true, don't return the empty string (it would be tested
        // like false) but as an object coerced to ''
        if(this.char.character_class && this.char.value == 'b'){
            return is_word[string.codepoints[pos - 1]] ? [] : false
        }
        return this.char == "$" ? EmptyString : false
    }else if(this.char === EmptyString){
        test = true
        cp = EmptyString
    }else if(this.char == "^"){
        return pos == 0 ? EmptyString : false
    }else if(this.char.character_class){
        switch(this.char.value){
            case 's':
                test = $B.unicode_tables.Zs[cp] !== undefined ||
                            $B.unicode_bidi_whitespace.indexOf(cp) > -1
                break
            case 'S':
                test = $B.unicode_tables.Zs[cp] === undefined &&
                            $B.unicode_bidi_whitespace.indexOf(cp) == -1
                break
            case '.':
                test = cp != 10 && cp != 13
                break
            case 'd':
                test = $B.unicode_tables.numeric[cp] !== undefined
                break
            case 'D':
                test = $B.unicode_tables.numeric[cp] === undefined
                break
            case 'b':
                test = (pos == 0 && is_word[cp]) ||
                       (pos == string.codepoints.length &&
                           is_word[string.codepoints[pos - 1]]) ||
                        is_word[cp] != is_word[string.codepoints[pos - 1]]
                return test ? [] : false
                break
        }
    }else if(this.char && ! this.char.items){
        if(this.flags && this.flags.value & IGNORECASE.value){
            var char = ord_to_char(cp)
            this.char.toUpperCase()
            test = (char.toUpperCase() == this.char.toUpperCase()) ||
                (char.toLowerCase() == this.char.toLowerCase())
        }else{
            try{
                test = this.char == ord_to_char(cp)
            }catch(err){
                console.log("no ord", cp)
                throw err
            }
        }
    }else if(this.char == '.'){
        test = this.ord == cp
    }else if(this.char.items){
        // character set
        for(var item of this.char.items){
            if(Array.isArray(item.ord) &&
                    cp >= item.ord[0] &&
                    cp <= item.ord[1]){
                test = true
                break
            }else if(item.ord == cp){
                test = true
                break
            }
        }
        if(this.char.neg){
            test = ! test
        }
    }else{
        // compare codepoints
        test = this.ord === cp
    }
    if(test){
        if(this.repeat){
            this.nb_success++
            if(! this.accepts_success()){
                return false
            }
        }
        for(var group of this.groups){
            if(group.num !== undefined){
                if(cp !== EmptyString){
                    group.match_codepoints.push(cp)
                }
                group.nb_success++
            }
        }
        if(cp !== EmptyString){
            this.match_codepoints.push(cp)
            return [cp]
        }
        return []
    }
    return false
}

var ConditionalBackref = function(pos, group_ref){
    this.type = "conditional backref"
    this.pos = pos
    this.group_ref = group_ref
    this.chars = []
    this.match_codepoints = []
    this.nb_success = 0
    this.re_if_exists = new Node()
    this.re_if_not_exists = new Node()
    this.nb_options = 1
}

ConditionalBackref.prototype.add = function(item){
    if(this.nb_options == 1){
        this.re_if_exists.add(item)
    }else if(this.nb_options == 2){
        this.re_if_not_exists.add(item)
    }
    item.parent = this
}

ConditionalBackref.prototype.fixed_length = function(){
    var fl1 = this.re_if_exists.fixed_length(),
        fl2 = this.re_if_not_exists.fixed_length()
    if(fl1 === undefined || fl2 === undefined ||
            fl1 != fl2){
        return undefined
    }
    return fl1
}


ConditionalBackref.prototype.match = function(s, pos){
    var group_ref = this.group_ref
    var re = this.parent
    while(re.parent){
        re = re.parent
    }
    var test
    if(re.$groups[group_ref] && re.$groups[group_ref].item.nb_success != 0){
        test = match(this.re_if_exists, s, pos)
    }else{
        test = match(this.re_if_not_exists, s, pos)
    }
    return test.match_codepoints
}

var Group = function(pos, extension){
    this.type = "group"
    this.pos = pos
    this.items = []
    this.chars = []
    this.match_codepoints = []
    this.nb_success = 0
    this.extension = extension
}

Group.prototype.add = Node.prototype.add

Group.prototype.match = function(s, pos){
    var group_match
    if(this.extension && this.extension.type == "lookahead_assertion"){
        group_match = match(this, s, pos)
        if(group_match){
            return []
        }
    }else if(this.extension && this.extension.type == "positive_lookbehind"){
        var start = pos - this.length,
            s1 = new CodePoints(s.substring(start, pos)),
            group_match = match(this, s1, 0)
        if(group_match && group_match.length == pos - start){
            return []
        }
        return false
    }else{
        group_match = match(this, s, pos)
    }
    if(group_match){
        if(this.repeat){
            // test if repeat condition is still ok
            if(! this.accepts_success()){
                return false
            }
        }
    }
    return group_match.match_codepoints
}

Group.prototype.match_string = function(){
    return from_codepoint_list(this.match_codepoints)
}

Group.prototype.accepts_success = function(){
    // Called when a repeated model succeeded.
    // Return true if the string currently matching the model is
    // compatible with the repeat option
    if(this.repeat.op == '?' && this.nb_success > 1){
        return false
    }else if(this.repeat.op == '+' && this.nb_success == 0){
        // group with the '+' repeat and no string matched
        return false
    }else if(Array.isArray(this.repeat.op)){
        // test fails if there are too many repeats
        if(this.repeat.op.length == 1 &&
                this.nb_success > this.repeat.op[0]){
            return false
        }else if(this.nb_success > this.repeat.op[1]){
            return false
        }
    }
    return true
}

Group.prototype.accepts_failure = function(){
    // Called when a repeated model failed.
    // Return true if the string currently matching the model is
    // compatible with the repeat option
    if(this.repeat.op == '?' && this.nb_success > 1){
        return false
    }if(this.repeat.op == '+' && this.nb_success == 0){
        // group with the '+' repeat and no string matched
        return false
    }else if(Array.isArray(this.repeat.op)){
        // test fails if the number of repeats is not correct
        if(this.repeat.op.length == 1 &&
                this.nb_success != this.repeat.op[0]){
            return false
        }else if(this.nb_success < this.repeat.op[0] ||
                this.nb_success > this.repeat.op[1]){
            return false
        }
    }
    return true
}

Group.prototype.done = function(){
    // Return true if a repeated model that succeeded does not allow any
    // additional character.
    if(this.repeat.op == '?' && this.nb_success == 1){
        return true
    }else if(Array.isArray(this.repeat.op)){
        // test fails if the number of repeats is not correct
        if(this.repeat.op.length == 1 &&
                this.nb_success == this.repeat.op[0]){
            return true
        }else if(this.nb_success == this.repeat.op[1]){
            return true
        }
    }
    return false
}

Group.prototype.fixed_length = Node.prototype.fixed_length

function GroupRef(group_num, item){
    this.num = group_num
    this.item = item
}

GroupRef.prototype.fixed_length = function(){
    return this.item.fixed_length()
}

Char.prototype.accepts_failure = Group.prototype.accepts_failure
Char.prototype.accepts_success = Group.prototype.accepts_success
Char.prototype.done = Group.prototype.done

BackReference.prototype.accepts_failure = Group.prototype.accepts_failure
BackReference.prototype.accepts_success = Group.prototype.accepts_success
BackReference.prototype.done = Group.prototype.done

function SetFlags(pos, flags){
    this.pos = pos
    this.on_flags = flags.on_flags
    this.off_flags = flags.off_flags
    this.items = []
}

SetFlags.prototype.add = Node.prototype.add

function StringStart(pos){
    this.pos = pos
}

StringStart.prototype.match = function(string, pos){
    return pos == 0 ? [] : false
}

StringStart.prototype.fixed_length = function(){
    return 0
}

function StringEnd(pos){
    this.pos = pos
}

StringEnd.prototype.match = function(string, pos){
    return pos > string.codepoints.length - 1 ? [] : false
}

StringEnd.prototype.fixed_length = function(){
    return 0
}

function read(name, pos){
    var code = name.charCodeAt(pos),
        len = 1
    if(code >= 0xd800 && code <= 0xdbff){
        // surrogate pair
        code = 0x10000
        code += (name.charCodeAt(pos) & 0x03FF) << 10
        code += (name.charCodeAt(pos + 1) & 0x03FF)
        len = 2
    }
    return [code, len]
}

function validate(name){
    if(name == ''){
        fail("missing group name")
    }else if(name[0].match(/\d/) || name.match(/\./)){
        fail(`bad character in group name '${name}'`)
    }

    var $B = window.__BRYTHON__,
        [code, len] = read(name, 0)
    if($B.unicode_tables.XID_Start[code]){
        var pos = len
        while(pos < name.length){
            [code, len] = read(name, pos)
            if($B.unicode_tables.XID_Continue[code]){
                pos += len
            }else{
                break
            }
        }
        if(pos != name.length){
            console.log("bad character", pos, name, name.charCodeAt(pos))
            fail(`bad character in group name '${name}'`)
        }
    }else{
        fail(`bad character in group name '${name}'`)
    }
}

function ord_to_char(ord){
    char = _b_.chr(ord)
    if(char.__class__ === _b_.str.$surrogate){
        char = char.items[0]
    }
    return char
}

function escaped_char(text, pos){
    var special = text[pos + 1]
    if(special === undefined){
        fail('bad escape (end of pattern)', pos)
    }
    if('AbBdDsSwWZ'.indexOf(special) > -1){
        return {
            pos,
            value: special,
            length: 2,
            character_class: true,
            toString: function(){return '\\' + special}
        }
    }else if(special == 'N'){
        if(text[pos + 2] != '{'){
            fail('missing {', pos)
        }
        var i = pos + 3,
            description = ''
        while(i < text.length){
            if(text[i] == '}'){
                break
            }
            description += text[i]
            i++
        }
        if(description == ''){
            fail("missing character name", pos)
        }
        if(i == text.length){
            fail("missing }, unterminated name", pos)
        }
        var ord = validate_named_char(description)
        return {
            type: 'N',
            ord,
            char: ord_to_char(ord),
            length: i - pos
        }
    }else if(special == 'x'){
        // \xhh = character with hex value hh
        var mo = /^[0-9a-fA-F]{0,2}/.exec(text.substr(pos + 2)),
            hh = mo ? mo[0] : ''
        if(mo && mo[0].length == 2){
            var ord = eval("0x" + mo[0])
            return {
                type: 'x',
                ord,
                char: ord_to_char(ord),
                length: 2 + mo[0].length
            }
        }
        fail('incomplete escape \\x' + hh, pos)
    }else if(special == 'u'){
        // \uxxxx = character with 16-bit hex value xxxx
        var mo = /^[0-9a-fA-F]{0,4}/.exec(text.substr(pos + 2)),
            xx = mo ? mo[0] : ''
        if(mo && mo[0].length == 4){
            var ord = eval("0x" + mo[0])
            return {
                type: 'u',
                ord,
                char: ord_to_char(ord),
                length: 2 + mo[0].length
            }
        }
        fail('incomplete escape \\u' + xx, pos)
    }else if(special == 'U'){
        // \Uxxxxxxxx = character with 32-bit hex value xxxxxxxx
        var mo = /^[0-9a-fA-F]{0,8}/.exec(text.substr(pos + 2)),
            xx = mo ? mo[0] : ''
        if(mo && mo[0].length == 8){
            var ord = eval("0x" + mo[0])
            if(ord > 0x10FFFF){
                fail(`bad escape \\U${mo[0]}`)
            }
            return {
                type: 'U',
                ord,
                char: ord_to_char(ord),
                length: 2 + mo[0].length
            }
        }
        fail('incomplete escape \\U' + xx, pos)
    }else{
        // octal ?
        // If the first digit of number is 0, or number is 3 octal digits
        // long, it will not be interpreted as a group match, but as the
        // character with octal value number
        var mo = /^[0-7]{3}/.exec(text.substr(pos + 1))
        if(mo == null){
            mo = /^0[0-7]*/.exec(text.substr(pos + 1))
        }
        if(mo){
            var octal_value = eval('0o' + mo[0])
            if(octal_value > 0o377){
                fail(`octal escape value \\` +
                    `${mo[0]} outside of range 0-0o377`, pos)
            }
            return {
                type: 'o',
                ord: octal_value,
                char: ord_to_char(octal_value),
                length: 1 + mo[0].length
            }
        }
        var mo = /^\d+/.exec(text.substr(pos + 1))
        if(mo){
            return {
                type: 'backref',
                value: parseInt(mo[0]),
                length: 1 + mo[0].length
            }
        }
        var trans = {f: '\f', n: '\n', r: '\r', t: '\t', v: '\v'},
            res = trans[special]
        if(res){
            return res
        }
        if(special.match(/[a-zA-Z]/)){
            fail("invalid escape " + special, pos)
        }else{
            return special
        }
    }
}

function check_character_range(t, positions){
    // Check if last 2 items in t are a valid character range
    var start = t[t.length - 2],
        end = t[t.length - 1]
    if(start.character_class || end.character_class){
        fail(`bad character range ${start}-${end}`,
            positions[positions.length - 2])
    }else if(end < start){
        fail(`bad character range ${start}-${end}`,
            positions[positions.length - 2])
    }
    t.splice(t.length - 2, 2, {
        type: 'character_range',
        start: start,
        end: end,
        ord: [start.ord, end.ord]
    })
}

function parse_character_set(text, pos){
    // Parse character set starting at position "pos" in "text"
    var start = pos,
        result = {items: []},
        positions = []
    pos++
    if(text[pos] == '^'){
        result.neg = true
        pos++
    }else if(text[pos] == ']'){
        // a leading ] is the character "]", not the set end
        result.items.push(']')
        positions.push(pos)
        pos++
    }
    var range = false
    while(pos < text.length){
        var char = text[pos]
        if(char == ']'){
            return [result, pos]
        }
        if(char == '\\'){
            var escape = escaped_char(text, pos)
            if(typeof escape == "string"){
                escape = {
                    ord: _b_.ord(escape),
                    toString: function(){
                        return escape
                    }
                }
            }
            if(escape.type == "num"){
                // [\9] is invalid
                fail("bad escape 1 \\" +
                    escape.value.toString()[0], pos)
            }
            result.items.push(escape)
            positions.push(pos)
            if(range){
                check_character_range(result.items, positions)
            }
            pos += escape.length
        }else if(char == '-'){
            // Character range
            if(result.items.length == 0){
                fail("bad character range", pos)
            }else{
                range = true
                pos++
            }
        }else{
            positions.push(pos)
            result.items.push({
                ord: _b_.ord(char),
                char,
                toString: function(){
                    return this.char
                }
            })
            if(range){
                check_character_range(result.items, positions)
            }
            range = false
            pos++
        }
    }
    fail("unterminated character set", start)
}

function open_unicode_db(){
    if($B.unicodedb === undefined){
        var xhr = new XMLHttpRequest
        xhr.open("GET",
            $B.brython_path + "unicode.txt", false)
        xhr.onreadystatechange = function(){
            if(this.readyState == 4){
                if(this.status == 200){
                    $B.unicodedb = this.responseText
                }else{
                    console.log(
                        "Warning - could not load unicode.txt")
                }
            }
        }
        xhr.send()
    }
}

function validate_named_char(description){
    // validate that \N{<description>} is in the Unicode db
    // Load unicode table if not already loaded
    if(description.length == 0){
        fail("missing character name")
    }
    open_unicode_db()
    if($B.unicodedb !== undefined){
        var re = new RegExp("^([0-9A-F]+);" +
            description + ";.*$", "m")
        search = re.exec($B.unicodedb)
        if(search === null){
            fail(`undefined character name '${description}'`)
        }
        return eval("0x" + search[1])
    }else{
        fail("could not load unicode.txt")
    }
}

function compile(pattern, flags){
    var group_num = 0,
        group_stack = [],
        groups = {},
        subitems = [],
        pos,
        node = new Node()
    if(flags === no_flag){
        flags = Flag.$factory("", 32) // default is Unicode
    }
    if(pattern.__class__ === _b_.str.$surrogate){
        pattern = pattern.items
        pattern.substring = function(start, stop){
            return this.slice(start, stop).join('')
        }
    }
    for(var item of tokenize(pattern)){
        if(item instanceof Group){
            group_stack.push(item)
            node.add(item)
            item.state = "open"
            item.num = group_num
            node = item // next items will be stored as group's items
            pos = item.pos
            if(item.extension){
                if(item.extension.non_capturing){
                    delete item.num
                }else if(item.extension.type == "name_def"){
                    subitems.push(item)
                    group_num++
                    var value = item.extension.value
                    validate(value)
                    if(groups[value] !== undefined){
                        fail(`redefinition of group name` +
                            ` '${value}' as group ${group_num}; was group` +
                            ` ${groups[value].num}`, pos)
                    }
                    groups[value] = groups[group_num] = new GroupRef(group_num, item)
                }else if(item.extension.type.indexOf("lookahead") > -1 ||
                        item.extension.type.indexOf("lookbehind") > -1){
                    // a lookahead or lookbehind assertion is relative to the
                    // previous regexp
                    while(node.items.length > 0){
                        item.add(node.items.shift())
                    }
                    node = item
                    subitems.push(item)
                }else{
                    subitems.push(item)
                    group_num++
                    groups[group_num] = new GroupRef(group_num, item)
                }
            }else{
                subitems.push(item)
                group_num++
                groups[group_num] = new GroupRef(group_num, item)
            }
        }else if(item instanceof GroupEnd){
            end_pos = item.pos
            if(group_stack.length == 0){
                fail("unbalanced parenthesis", pos)
            }
            var item = group_stack.pop()
            item.end_pos = end_pos
            try{
                item.text = pattern.substring(item.pos + 1, end_pos)
            }catch(err){
                console.log("err avec pattern substring", pattern)
                throw err
            }
            if(item instanceof Group && item.extension &&
                    item.extension.type &&
                    item.extension.type.indexOf("lookbehind") > -1){
                item.length = item.fixed_length()
                if(item.length === undefined){
                    fail("look-behind requires fixed-width pattern", pos)
                }
            }
            if(item instanceof Group && item.items.length == 0){
                item.add(new Char(pos, EmptyString, group_stack.concat([item])))
            }else if(item instanceof ConditionalBackref){
                if(item.re_if_exists.items.length == 0){
                    item.re_if_exists.add(new Char(pos, EmptyString, group_stack))
                }else if(item.re_if_not_exists.items.length == 0){
                    item.re_if_not_exists.add(new Char(pos, EmptyString, group_stack))
                }
            }
            item.state = 'closed'
            node = item.parent
        }else if(item instanceof ConditionalBackref){
            var pos = item.pos,
                group_ref = item.group_ref
            if(typeof group_ref == "number"){
                if(group_ref == 0){
                    fail(`bad group number`, pos + 3)
                }
                if(group_ref > group_num || group_ref >= MAXGROUPS){
                    fail(`invalid group reference ${group_ref}`, pos + 1)
                }
            }else if(groups[group_ref] !== undefined){
                if(groups[group_ref].item.state == "open"){
                    fail("cannot refer to an open group", pos)
                }
            }else{
                fail(`unknown group name '${group_ref}'`, pos)
            }
            group_stack.push(item)
            node.add(item)
            item.state = "open"
            item.num = group_num
            node = item // next items will be stored as group's items
        }else if(item instanceof BackReference){
            pos = item.pos
            if(item.type == "num" && item.value > 99){
                var head = item.value.toString().substr(0, 2)
                fail(`invalid group reference ${head}`, pos + 1)
            }
            if(groups[item.value] !== undefined){
                if(groups[item.value].item.state == "open"){
                    fail("cannot refer to an open group", pos)
                }
            }else if(item.type == "name"){
                fail(`unknown group name '${item.value}'`, pos)
            }else if(item.type == "num"){
                fail(`invalid group reference ${item.value}`, pos)
            }
            item.groups = []
            for(var group of group_stack){
                item.groups.push(group)
            }
            node.add(item)
        }else if(item instanceof Char){
            item.flags = flags
            subitems.push(item)
            item.groups = []
            for(var group of group_stack){
                if(group.extension && group.extension.type &&
                        group.extension.type.indexOf('lookbehind') > -1){
                    var parent = node
                    while(parent){
                        if(parent === group){
                            break
                        }
                        parent = parent.parent
                    }
                }
                item.groups.push(group)
                group.chars.push(item)
            }
            node.add(item)
        }else if(item instanceof Repeater){
            // check that item is not in a lookbehind group
            var pnode = node
            while(pnode){
                if(pnode.extension && pnode.extension.type &&
                        pnode.extension.type.indexOf("lookbehind") > -1){
                    fail("look-behind requires fixed-width pattern", pos)
                }
                pnode = pnode.parent
            }
            pos = item.pos
            if(node.items.length == 0){
                fail("nothing to repeat", pos)
            }
            var previous = node.items[node.items.length - 1]
            if(previous instanceof Char ||
                    previous instanceof Group ||
                    previous instanceof BackReference){
                if(previous.repeat){
                    fail("multiple repeat", pos)
                }
                previous.repeat = item
                // mark all parents of item as no fixed length
                var parent = item
                while(parent){
                    parent.fixed_length = false
                    parent = parent.parent
                }
            }else{
                fail("nothing to repeat", pos)
            }
        }else if(item instanceof Or){
            pos = item.pos
            if(node instanceof ConditionalBackref){
                // case '(?(num)a|'
                if(node.nb_options == 1){
                    node.nb_options++
                }else{
                    fail('conditional backref with more than ' +
                       'two branches', pos)
                }
            }else if(node.items.length == 0){
                var choice = new Choice(),
                    case1 = new Case()
                case1.add(new Char(pos, EmptyString))
                choice.add(case1)
                node.add(choice)
                var case2 = new Case()
                choice.add(case2)
                node = case2
            }else if(node instanceof Case){
                var new_case = new Case()
                node.parent.add(new_case)
                node = new_case
            }else{
                var previous = node.items[node.items.length - 1]
                if(previous instanceof Case){
                    var new_case = new Case()
                    previous.add(new_case)
                    node = new_case
                }else{
                    var choice = new Choice(),
                        case1 = new Case()
                    while(node.items.length > 0){
                        case1.add(node.items.shift())
                    }
                    for(var group of group_stack){
                        choice.groups.push(group)
                    }
                    choice.add(case1)
                    node.add(choice)
                    var case2 = new Case()
                    choice.add(case2)
                    node = case2
                }
            }
        }else if(item instanceof StringStart ||
                 item instanceof StringEnd){
            node.add(item)
        }else if(item instanceof SetFlags){
            if(item.items.length == 0){
                if(item.pos != 0){
                    fail("Flags not at the start of the expression '" +
                        `${pattern}`)
                }
                for(var on_flag of item.on_flags){
                    flags.value |= inline_flags[on_flag].value
                }
            }else{
                node.add(item)
            }
        }else{
            fail("unknown item type " + item, pos)
        }
    }
    if(group_stack.length > 0){
        var last = group_stack[group_stack.length - 1]
        fail("missing ), unterminated subpattern", last.pos)
    }
    while(node.parent){
        node = node.parent
    }
    node.subitems = subitems
    node.$groups = groups
    node.pattern = pattern
    node.groups = group_num
    node.flags = flags
    return node
}

function checkPatternError(pattern, msg){
    try{
        compile(pattern)
    }catch(err){
        if(err.message !== msg){
            console.log("pattern:  ", pattern,
                "\nerror:    ", err.message, "\nexpected: ", msg)
        }
        return
    }
    fail(pattern + " should have raised Error")
}

function* tokenize(pattern){
    var pos = 0
    while(pos < pattern.length){
        var char = pattern[pos]
        if(char == '('){
            if(pattern[pos + 1] == '?'){
                if(pattern[pos + 2] == 'P'){
                    if(pattern[pos + 3] == '<'){
                        var name = '',
                            i = pos + 4
                        while(i < pattern.length){
                            if(pattern[i] == '>'){
                                break
                            }else if(pattern[i] == ')'){
                                fail("missing >, unterminated name", pos)
                            }
                            name += pattern[i]
                            i++
                        }
                        validate(name)
                        if(i == pattern.length){
                            fail("missing >, unterminated name", pos)
                        }
                        yield new Group(pos, {type: 'name_def', value: name})
                        pos = i + 1
                        continue
                    }else if(pattern[pos + 3] == '='){
                        var name = '',
                            i = pos + 4
                        while(i < pattern.length){
                            if(pattern[i] == ')'){
                                break
                            }
                            name += pattern[i]
                            i++
                        }
                        validate(name)
                        if(i == pattern.length){
                            fail("missing ), unterminated name", pos)
                        }
                        yield new BackReference(pos, 'name', name)
                        pos = i + 1
                        continue
                    }else if(pattern[pos + 3] === undefined){
                        fail("unexpected end of pattern", pos)
                    }else{
                        fail("unknown extension ?P" + pattern[pos + 3], pos)
                    }
                }else if(pattern[pos + 2] == '('){
                    var ref = '',
                        i = pos + 3
                    while(i < pattern.length){
                        if(pattern[i] == ')'){
                            break
                        }
                        ref += pattern[i]
                        i++
                    }
                    if(ref.match(/^\d+$/)){
                        ref = parseInt(ref)
                    }else{
                        validate(ref)
                    }
                    if(i == pattern.length){
                        fail("missing ), unterminated name", pos)
                    }
                    yield new ConditionalBackref(pos, ref)
                    pos = i + 1
                    continue
                }else if(pattern[pos + 2] == '='){
                    // (?=...) : lookahead assertion
                    yield new Group(pos, {type: 'lookahead_assertion'})
                    pos += 3
                    continue
                }else if(pattern[pos + 2] == '!'){
                    // (?!...) : negative lookahead assertion
                    yield new Group(pos, {type: 'negative_lookahead_assertion'})
                    pos += 3
                    continue
                }else if(pattern.substr(pos + 2, 2) == '<!'){
                    // (?<!...) : negative lookbehind
                    yield new Group(pos, {type: 'negative_lookbehind'})
                    pos += 4
                    continue
                }else if(pattern.substr(pos + 2, 2) == '<='){
                    // (?<=...) : positive lookbehind
                    yield new Group(pos, {type: 'positive_lookbehind'})
                    pos += 4
                    continue
                }else if(pattern[pos + 2] == '<'){
                    pos += 3
                    if(pos == pattern.length){
                        fail("unexpected end of pattern", pos)
                    }
                    fail("unknown extension ?<" + pattern[pos], pos)
                }else if(pattern[pos + 2] == ':'){
                    yield new Group(pos, {non_capturing: true})
                    pos += 3
                    continue
                }else if(pattern[pos + 2] === undefined){
                    fail("unexpected end of pattern", pos)
                }

                var flags = 'aiLmsux',
                    flags_start = pos
                if(pattern[pos + 2] == '-' ||
                        flags.indexOf(pattern[pos + 2]) > -1){
                    if(pattern[pos + 2] == '-'){
                        var on_flags = '',
                        has_off = true,
                        off_flags = ''
                        pos += 3
                    }else{
                        var on_flags = pattern[pos + 2],
                            has_off = false,
                            off_flags = '',
                            auL = 'auL'.indexOf(pattern[pos + 2]) > -1 ? 1 : 0,
                            closed = false
                        pos += 3
                        while(pos < pattern.length){
                            if(flags.indexOf(pattern[pos]) > -1){
                                if('auL'.indexOf(pattern[pos]) > -1){
                                    auL++
                                    if(auL > 1){
                                        fail("bad inline flags: flags 'a', 'u'" +
                                            " and 'L' are incompatible", pos)
                                    }
                                }
                                on_flags += pattern[pos]
                                pos++
                            }else if(pattern[pos] == '-'){
                                has_off = true
                                closed = true
                                pos++
                                break
                            }else if(pattern[pos].match(/[a-zA-Z]/)){
                                fail("unknown flag", pos)
                            }else if(pattern[pos] == ')'){
                                closed = true
                                break
                            }else if(pattern[pos] == ':'){
                                break
                            }else{
                                fail("missing -, : or )", pos)
                            }
                        }
                        if(! closed){
                            fail("missing -, : or )", pos)
                        }
                    }
                    if(has_off){
                        while(pos < pattern.length){
                            if(flags.indexOf(pattern[pos]) > -1){
                                if('auL'.indexOf(pattern[pos]) > -1){
                                    fail("bad inline flags: cannot turn off " +
                                        "flags 'a', 'u' and 'L'", pos)
                                }
                                if(on_flags.indexOf(pattern[pos]) > -1){
                                    fail("bad inline flags: flag turned on and off", pos)
                                }
                                off_flags += pattern[pos]
                                pos++
                            }else if(pattern[pos] == ':'){
                                break
                            }else if(pattern[pos].match(/[a-zA-Z]/)){
                                fail("unknown flag", pos)
                            }else if(off_flags == ''){
                                fail("missing flag", pos)
                            }else{
                                fail("missing :", pos)
                            }
                        }
                        if(off_flags == ''){
                            fail("missing flag", pos)
                        }
                    }
                    if(has_off && pattern[pos] != ':'){
                        fail("missing :", pos)
                    }
                    if(on_flags == '' && off_flags == ''){
                        fail("missing flag", pos)
                    }
                    var set_flags = new SetFlags(flags_start,
                        {on_flags, off_flags})
                    yield set_flags
                    if(! closed){
                        node = set_flags
                    }
                    pos++
                }else if(pattern[pos + 2] == '#'){
                    pos += 3
                    while(pos < pattern.length){
                        if(pattern[pos] == ')'){
                            break
                        }
                        pos++
                    }
                    if(pos == pattern.length){
                        fail("missing ), unterminated comment", pos)
                    }
                    pos++
                    continue
                }else{
                    fail("unknown extension ?" + pattern[pos + 2], pos)
                }
            }else{
                yield new Group(pos)
                pos++
            }
        }else if(char == ')'){
            yield new GroupEnd(pos)
            pos++
        }else if(char == '\\'){
            var escape = escaped_char(pattern, pos)
            if(escape.char !== undefined){
                yield new Char(pos, escape.char)
                pos += escape.length
            }else if(escape.type == "backref"){
                yield new BackReference(pos, "num", escape.value)
                pos += escape.length
            }else if(typeof escape == "string"){
                // eg "\."
                yield new Char(pos, escape)
                pos += 2
            }else{
                yield new Char(pos, escape)
                pos += escape.length
            }
        }else if(char == '['){
            // Set of characters
            var set,
                end_pos
            [set, end_pos] = parse_character_set(pattern, pos)
            yield new Char(pos, set)
            pos = end_pos + 1
        }else if('+?*'.indexOf(char) > -1){
            if(pattern[pos + 1] == '?'){
                yield new Repeater(pos, char, true)
                pos += 2
            }else{
                yield new Repeater(pos, char)
                pos++
            }
        }else if(char == '{'){
            var reps = /\{(\d+)((,)(\d+))?\}/.exec(pattern.substr(pos))
            if(reps){
                var limits = [parseInt(reps[1])]
                if(reps[4] !== undefined){
                    var max = parseInt(reps[4])
                    if(max < limits[0]){
                        fail('min repeat greater than max repeat', pos)
                    }
                    limits.push(max)
                }
                pos += reps[0].length
                if(pattern[pos + 1] == '?'){
                    yield new Repeater(pos, limits, true)
                    pos++
                }else{
                    yield new Repeater(pos, limits)
                }
            }else{
                fail('{ not terminated', pos)
            }
        }else if(char == '|'){
            yield new Or(pos)
            pos++
        }else if(char == '.'){
            yield new Char(pos,
                {
                    pos,
                    value: char,
                    length: 1,
                    character_class: true,
                    toString: function(){return '\\.'}
                }
            )
            pos++
        }else if(char == '^'){
            yield new StringStart(pos)
            pos++
        }else if(char == '$'){
            yield new StringEnd(pos)
            pos++
        }else{
            yield new Char(pos, char)
            pos++
        }
    }
}

function CodePoints(s){
    this.string = s
    this.getitem = $B.$call($B.$getattr(s, "__getitem__"))
    this.codepoints = to_codepoint_list(s)
    this.length = this.codepoints.length
}

CodePoints.prototype.substring = function(start, end){
    // returns the string from start to end
    if(end === undefined){
        return this.string.substring(start)
    }else{
        return this.string.substring(start, end)
    }
}

function match(pattern, string, pos, flags, endpos){
    function* PatternReader(pattern){
        if(pattern instanceof Char ||
                pattern instanceof ConditionalBackref){
            yield pattern
        }else if(pattern.surrogate){
            var pos = 0,
                len = pattern.length
            while(pos < len){
                yield pattern[pos]
                pos++
            }
        }else{
            var pos = 0,
                len = pattern.items.length
            while(pos < len){
                yield pattern.items[pos]
                pos++
            }
        }
    }

    var pos = pos || 0,
        start = pos,
        original_string = string
    if(typeof pattern == "string" || pattern.__class__ === _b_.str.$surrogate){
        pattern = compile(pattern, flags)
    }

    if(typeof string == "string" || string.__class__ === _b_.str.$surrogate){
        string = new CodePoints(string)
    }else if(string instanceof CodePoints){
        original_string = string.string
    }
    endpos = endpos === undefined ? string.codepoints.length : endpos
    codepoints = string.codepoints.slice(0, endpos)

    if(pattern.subitems){
        for(var subitem of pattern.subitems){
            subitem.match_codepoints = []
            subitem.nb_success = 0
        }
    }
    var pattern_reader = PatternReader(pattern)
    var model = pattern_reader.next().value,
        cp,
        match_codepoints = []
    while(true){
        cp = codepoints[pos]
        //console.log("match char", cp, "against model", model, "pos", pos)
        if(model === undefined){
            // Nothing more in pattern: match is successful
            return new MatchObject(original_string, match_codepoints, pattern,
                                   start, endpos)
        }
        if(cp === undefined){
            // end of string before end of pattern
            // if the next models accept an empty match, continue
            if(model.repeat && model.accepts_failure()){
                model = pattern_reader.next().value
                if(model === undefined){
                    return new MatchObject(original_string, match_codepoints,
                                           pattern, start, endpos)
                }
                continue
            }

        }
        if(model instanceof Group ||
                model instanceof Char ||
                model instanceof ConditionalBackref ||
                model instanceof BackReference ||
                model instanceof StringStart ||
                model instanceof StringEnd){

            var cps = model.match(string, pos)
            if(cps){
                match_codepoints = match_codepoints.concat(cps)
                pos += cps.length
                if((! model.repeat) || model.done()){
                    model = pattern_reader.next().value
                }
            }else if(model.repeat && model.accepts_failure()){
                model = pattern_reader.next().value
            }else{
                // If the previous model is repeated, test if a part of the
                // match would also match this model (backtracking)
                var previous,
                    backtracking = false
                if(model.parent !== undefined &&
                        model.parent.items !== undefined){
                    for(var m of model.parent.items){
                        if(m === model){
                            break
                        }
                        previous = m
                    }
                }
                if(previous){
                    if(previous.chars){
                        previous = previous.chars[previous.chars.length - 1]
                    }
                    if(pos > 0 &&
                            previous.repeat &&
                            previous.match_codepoints &&
                            previous.match_codepoints.length > 0){
                        var mcps = previous.match_codepoints.slice(),
                            prev_pos = pos - 1,
                            nb_match = 0,
                            parent = model.parent,
                            mo
                        while(prev_pos >= pos - mcps.length){
                            model.match_codepoints = []
                            model.nb_success = 0
                            mo = match({items: [model]}, string, prev_pos,
                                flags)
                            if(mo && mo.match_codepoints.length >= nb_match){
                                prev_pos--
                                backtracking = true
                                nb_match++
                            }else{
                                break
                            }
                        }
                        if(prev_pos < pos - 1){
                            previous.match_codepoints = mcps.slice(0,
                                mcps.length - nb_match)
                            model.match_codepoints = mcps.slice(mcps.length -
                                nb_match)
                            model.nb_success = nb_match
                        }
                    }
                }
                if(! backtracking){
                    if(model.repeat && model.accepts_failure()){
                        model = pattern_reader.next().value
                    }else{
                        return false
                    }
                }
            }
        }else if(model instanceof Choice){
            // save groups, they may be modified by unsuccessful matches
            // among the options
            var save_groups = []
            for(var group of model.groups){
                save_groups.push([group,
                               group.match_codepoints.slice(),
                               group.nb_success])
            }
            var found = false
            for(var option of model.items){
                var mo = match(option, string, pos, flags)
                if(mo){
                    found = true
                    match_codepoints = match_codepoints.concat(
                        mo.match_codepoints)
                    pos += mo.match_codepoints.length
                    break
                }
                // restore groups
                for(var i = 0, len = save_groups.length; i < len; i++){
                    save_groups[i][0].match_codepoints = save_groups[i][1]
                    save_groups[i][0].nb_success = save_groups[i][2]
                }
            }
            if(found){
                model = pattern_reader.next().value
            }else{
                return false
            }
        }else{
            console.log(model)
            throw Error("unknown model")
        }
    }
    return new MatchObject(original_string, match_string, pattern, start,
                           endpos)
}

function to_codepoint_list(s){
    var items = []
    if(s.__class__ === _b_.str.$surrogate){
        for(const item of s.items){
            items.push(_b_.ord(item))
        }
    }else{
        for(const char of s){
            items.push(char.codePointAt(0))
        }
    }
    return items
}

function from_codepoint_list(codepoints){
    var chars = [],
        has_surrogate
    for(const cp of codepoints){
        var char = _b_.chr(cp)
        if(char.length > 1){
            has_surrogate = true
        }
        chars.push(char)
    }
    if(has_surrogate){
        var res = str.$surrogate.$factory('')
        res.items = chars
        return res
    }
    return chars.join('')
}

function MatchObject(string, match_codepoints, re, start, endpos){
    this.string = string
    this.pos = start
    this.endpos = endpos
    this.match_codepoints = match_codepoints
    this.start = start
    this.end = start + match_codepoints.length
    this.re = re
}

MatchObject.prototype.group = function(group_num){
    if(group_num == 0){
        return this.match_string()
    }else if(this.re.$groups[group_num] !== undefined){
        var item = this.re.$groups[group_num].item
        if(item.nb_success == 0){
            return _b_.None
        }
        return from_codepoint_list(item.match_codepoints)
    }else if(_b_.isinstance(group_num, _b_.str)){
        throw _b_.IndexError.$factory("no such group")
    }else{
        throw _b_.IndexError.$factory(group_num)
    }
}

MatchObject.prototype.groups = function(_default){
    var result = []
    console.log("MO groups", this.re.$groups, this.re.$groups.length)
    for(var key in this.re.$groups){
        var group_num = this.re.$groups[key].num
        if(this.re.$groups[group_num] === undefined){
            result.push(_default)
        }else{
            result.push(this.re.$groups[group_num].item.match_string())
        }
    }
    return result
}

Object.defineProperty(MatchObject.prototype, 'length', {
    get() {
        // The length of the match object is that of its match_string, except
        // if it has surrogate pairs
        var len = 0
        for(const char of this.match_codepoints){
            len++
        }
        return len
    },
    set() {
        }
})

MatchObject.prototype.match_string = function(){
    return from_codepoint_list(this.match_codepoints)
}

var BMatchObject = $B.make_class("MatchObject",
    function(mo){
        return {
            __class__: BMatchObject,
            mo
        }
    }
)

BMatchObject.__getitem__ = function(){
    var $ = $B.args("__getitem__", 2, {self: null, key: null},
                ['self', 'key'], arguments, {}, null, null),
        self = $.self,
        key = $.key
    if(Array.isArray(key)){
        throw _b_.IndexError.$factory("no such group")
    }
    return BMatchObject.$group(self, [key])
}

BMatchObject.__repr__ = function(self){
    var mo = self.mo
    return `<re.Match object; span=(${mo.start}, ${mo.end}), ` +
        `match=${_b_.repr(mo.match_string())}>`
}

BMatchObject.__setitem__ = function(){
    throw _b_.TypeError.$factory("'re.Match' object does not " +
        "support item assignment")
}

BMatchObject.__str__ = BMatchObject.__repr__

BMatchObject.endpos = {
    __get__: function(self){
        return self.mo.endpos
    }
}

BMatchObject.group = function(self, group_num){
    var $ = $B.args("group", 1, {self: null}, ['self'], arguments,
                {}, 'args', null),
            self = $.self,
            args = $.args
    if(args.length == 0){
        args[0] = 0
    }
    return BMatchObject.$group(self, args)
}

BMatchObject.groups = function(self){
    var $ = $B.args("group", 2, {self: null, default: null},
                ['self', 'default'], arguments,
                {default: _b_.None}, null, null),
            self = $.self,
            _default = $.default
    var result = []
    if(self.mo === false){
        throw _b_.AttributeError.$factory("no attr groups")
    }
    for(var i = 1; i <= self.mo.re.groups; i++){
        var group = self.mo.re.$groups[i],
            s = group.item.match_string()
        if(group.item.nb_success == 0){
            s = _default
        }else if(self.mo.data_type === _b_.bytes){
            s = string2bytes(s)
        }
        result.push(s)
    }
    return $B.fast_tuple(result)
}

BMatchObject.$group = function(self, args){
    var res = []
    for(var i = 0, len = args.length; i < len; i++){
        var group_num = args[i]
        if(!_b_.isinstance(group_num, _b_.str)){
            try{
                group_num = $B.$GetInt(group_num)
            }catch(err){
                throw _b_.IndexError.$factory(group_num)
            }
            if($B.rich_comp('__lt__', group_num, 0) ||
                $B.rich_comp('__gt__', group_num,
                        self.mo.re.groups)){
                throw _b_.IndexError.$factory("no such group")
            }
        }
        var item = self.mo.group.call(self.mo, group_num)
        if(self.mo.data_type === _b_.bytes){
            item = string2bytes(item)
        }
        res.push(item)
    }
    return len == 1 ? res[0] : _b_.tuple.$factory(res)
}

BMatchObject.pos = {
    __get__: function(self){
        return self.mo.start
    }
}

BMatchObject.re = {
    __get__: function(self){
        return self.mo.re.pattern
    }
}

BMatchObject.regs = {
    __get__: function(self){
        var res = [$B.fast_tuple([self.mo.start, self.mo.end])]
        for(var group_num in self.mo.re.$groups){
            if(! isNaN(parseInt(group_num))){
                var group = self.mo.re.$groups[group_num].item
                res.push($B.fast_tuple([group.pos,
                    group.pos + group.match_codepoints.length]))
            }
        }
        return $B.fast_tuple(res)
    }
}

BMatchObject.span = function(){
    var $ = $B.args("span", 2, {self: null, group: null},
                ['self', 'group'], arguments,
                {group: 0}, null, null),
            self = $.self,
            group = $.group
    if(group == 0){
        return $B.fast_tuple([self.mo.start, self.mo.end])
    }else{
        console.log(self.mo.re.$groups[group])
        return $B.fast_tuple([-1, -1])
    }
}

BMatchObject.string = {
    __get__: function(self){
        return self.mo.string
    }
}

$B.set_func_names(BMatchObject, "re")

function str_or_bytes(string, pattern, repl){
    // Check that string and pattern are of the same type : (subclass of) str
    // or (subclass of) bytes
    // Return an object with attributes:
    // - type: str or bytes
    // - string and pattern : strings
    var bytes_like = [_b_.bytes, _b_.bytearray, _b_.memoryview]
    if(typeof string == "string" || _b_.isinstance(string, _b_.str)){
        if(typeof pattern == "string" || _b_.isinstance(pattern, _b_.str)){
            if(pattern.__class__ !== _b_.str.$surrogate){
                pattern = pattern + ''
            }
        }else if(! (pattern instanceof Node) &&
                ! (typeof pattern.text == "string")){
            throw _b_.TypeError.$factory(`cannot use a `+
                `${$B.class_name(pattern)} pattern on a string-like object`)
        }
        if(repl !== undefined){
            if(typeof repl == "string" || _b_.isinstance(repl, _b_.str)){
                if(repl.__class__ !== _b_.str.$surrogate){
                    repl = repl + ''
                }
            }else if(typeof repl !== "function"){
                throw _b_.TypeError.$factory(`cannot use a `+
                    `${$B.class_name(repl)} repl on a string-like object`)
            }
        }
        if(string.__class__ !== _b_.str.$surrogate){
            string += '' // for string subclasses
        }
        return {
            type: _b_.str,
            string: new CodePoints(string),
            pattern,
            repl
        }
    }else if(_b_.isinstance(string, bytes_like)){
        if(! _b_.isinstance(pattern, bytes_like) &&
                (! pattern instanceof Node)){
            throw _b_.TypeError.$factory(`cannot use a ${$B.class_name(pattern)}` +
                ' pattern on a bytes-like object')
        }
        if(repl &&
                ! _b_.isinstance(repl, bytes_like)){
            throw _b_.TypeError.$factory(`cannot use a ${$B.class_name(repl)}` +
                ' repl on a bytes-like object')
        }
        var res = {
            type: _b_.bytes,
            string: _b_.bytes.decode(_b_.bytes.$factory(string), 'latin1')
        }
        if(pattern instanceof Node){
            res.pattern = pattern.pattern
        }else{
            res.pattern = _b_.bytes.decode(_b_.bytes.$factory(pattern), 'latin1')
        }
        if(repl){
            res.repl = _b_.bytes.decode(_b_.bytes.$factory(repl), 'latin1')
        }
        return res
    }else{
        throw _b_.TypeError.$factory("invalid string type: " +
            $B.class_name(string))
    }
}

function string2bytes(s){
    var t = []
    for(var i = 0, len = s.length; i < len; i++){
        t.push(s.charCodeAt(i))
    }
    return _b_.bytes.$factory(t)
}

function check_pattern_flags(pattern, flags){
    if(pattern.__class__ === BPattern){
        if(flags !== no_flag){
            throw _b_.ValueError.$factory(
                "cannot process flags argument with a compiled pattern")
        }
    }
    return pattern
}

function subn(string, pattern, repl, count, flags){
    var res = '',
        pos = 0,
        data = str_or_bytes(string, pattern, repl),
        nb_sub = 0
    if(! (data.pattern instanceof Node)){
        pattern = compile(data.pattern, flags)
    }
    if(data.repl.__class__ === _b_.str.$surrogate){
        data.repl = data.repl.items.join('')
    }
    if(typeof data.repl == "string"){
        data.repl = data.repl.replace(/\\n/g, '\n')
        data.repl = data.repl.replace(/\\r/g, '\r')
        data.repl = data.repl.replace(/\\t/g, '\t')
        data.repl = data.repl.replace(/\\b/g, '\b')
        data.repl = data.repl.replace(/\\v/g, '\v')
        data.repl = data.repl.replace(/\\f/g, '\f')
        data.repl = data.repl.replace(/\\a/g, '\a')
        // detect backreferences
        var pos = 0,
            escaped = false,
            br = false,
            repl1 = "",
            has_backref = false
        while(pos < data.repl.length){
            br = false
            if(data.repl[pos] == "\\"){
                escaped = ! escaped
                if(escaped){
                    pos++
                    continue
                }
            }else if(escaped){
                escaped = false
                var mo = /^\d+/.exec(data.repl.substr(pos))
                if(mo){
                    var escape = escaped_char(data.repl, pos - 1)
                    if(escape.type == "o"){
                        if(escape.ord > 0o377){
                            fail(`octal escape value \\${mo[0]} ` +
                                " outside of range 0-0o377", pos)
                        }
                        repl1 += escape.char
                        pos += escape.length - 1
                        continue
                    }else if(escape.type != "backref"){
                        var group_num = mo[0].substr(0,
                            Math.min(2, mo[0].length))
                        fail(`invalid group reference ${group_num}`, pos)
                    }else{
                        // only keep first 2 digits
                        var group_num = mo[0].substr(0,
                            Math.min(2, mo[0].length))
                        // check that pattern has the specified group num
                        if(pattern.$groups[group_num] === undefined){
                            fail(`invalid group reference ${group_num}`,
                                pos)
                        }else{
                            mo[0] = group_num
                        }
                    }
                    if(! has_backref){
                        var parts = [data.repl.substr(0, pos - 1),
                                parseInt(mo[0])]
                    }else{
                        parts.push(data.repl.substring(next_pos, pos - 1))
                        parts.push(parseInt(mo[0]))
                    }
                    has_backref = true
                    var next_pos = pos + mo[0].length
                    br = true
                    pos += mo[0].length
                }else if(data.repl[pos] == "g"){
                    pos++
                    if(data.repl[pos] != '<'){
                        fail("missing <", pos)
                    }
                    pos++
                    mo = /(.*?)>/.exec(data.repl.substr(pos))
                    if(mo){
                        if(mo[1] == ""){
                            pos += mo[0].length
                            fail("missing group name", pos - 1)
                        }
                        var group_name = mo[1]
                        if(/^\d+$/.exec(group_name)){
                            if(pattern.$groups[group_name] === undefined){
                                fail(`invalid group reference ${group_name}`,
                                    pos)
                            }
                        }else{
                            if(! _b_.str.isidentifier(group_name)){
                                var cps = to_codepoint_list(group_name)
                                if($B.unicode_tables.XID_Start[cps[0]] === undefined){
                                    fail("bad character in group name '" +
                                        group_name + "'", pos)
                                }else{
                                    for(cp of cps.slice(1)){
                                        if($B.unicode_tables.XID_Continue[cp] === undefined){
                                            fail("bad character in group name '" +
                                                group_name + "'", pos)
                                        }
                                    }
                                }
                            }
                            if(pattern.$groups[group_name] === undefined){
                                throw _b_.IndexError.$factory(
                                    `unknown group name '${group_name}'`,
                                    pos)
                            }
                        }
                        if(! has_backref){
                            var parts = [data.repl.substr(0, pos - 3),
                                    mo[1]]
                        }else{
                            parts.push(data.repl.substring(next_pos, pos - 3))
                            parts.push(mo[1])
                        }
                        has_backref = true
                        var next_pos = pos + mo[0].length
                        br = true
                        pos = next_pos
                    }else{
                        if(data.repl.substr(pos).length > 0){
                            fail("missing >, unterminated name", pos)
                        }else{
                            fail("missing group name", pos)
                        }
                    }
                }else{
                    if(/[a-zA-Z]/.exec(data.repl[pos])){
                        fail("unknown escape", pos)
                    }
                    pos += data.repl[pos]
                }
            }
            if(! br){
                repl1 += data.repl[pos]
                pos ++
            }
        }
        if(has_backref){
            parts.push(data.repl.substr(next_pos))
            data.repl = function(mo){
                var res = parts[0]
                for(var i = 1, len = parts.length; i < len; i += 2){
                    if(mo.mo.re.$groups[parts[i]] === undefined){
                        pos++
                        var group_num = parts[i].toString().substr(0, 2)
                        fail(`invalid group reference ${group_num}`, pos)
                    }
                    res += mo.mo.re.$groups[parts[i]].item.match_string()
                    res += parts[i + 1]
                }
                return res
            }
        }
    }
    pos = 0
    for(var bmo of $module.finditer(pattern, string)){
        var mo = bmo.mo // finditer returns instances of BMatchObject
        res += data.string.substring(pos, mo.start)
        if(typeof data.repl == "function"){
            res += $B.$call(data.repl)(BMatchObject.$factory(mo))
        }else{
            res += repl1
        }
        nb_sub++
        pos = mo.end
        if(pos >= string.length){
            break
        }
        if(count != 0 && nb_sub >= count){
            break
        }
    }
    res += data.string.substring(pos)
    if(data.type === _b_.bytes){
        res = _b_.str.encode(res, "latin-1")
    }
    return [res, nb_sub]
}

var $module = {
    compile: function(){
        var $ = $B.args("compile", 2, {pattern: null, flags: null},
                    ['pattern', 'flags'], arguments, {flags: no_flag},
                    null, null)
        $.pattern = check_pattern_flags($.pattern, $.flags)
        return BPattern.$factory(compile($.pattern, $.flags))
    },
    error: error,
    findall: function(){
        var $ = $B.args("findall", 3,
                    {pattern: null, string: null, flags: null},
                    ['pattern', 'string', 'flags'], arguments,
                    {flags: no_flag}, null, null),
                pattern = $.pattern,
                string = $.string,
                flags = $.flags
        pattern = check_pattern_flags(pattern, flags)
        var data = str_or_bytes(string, pattern)

        if(data.type === _b_.str){
            function conv(s){
                return s === EmptyString ? '' : s
            }
        }else{
            function conv(s){
                return string2bytes(s)
            }
        }

        var iter = $module.finditer.apply(null, arguments),
            res = []

        while(true){
            var next = iter.next()
            if(next.done){
                return res
            }
            var bmo = next.value,
                mo = bmo.mo
            if(mo.re.groups){
                if(mo.re.groups == 1){
                    res.push(conv(mo.re.$groups[1].item.match_string()))
                }else{
                    var groups = []
                    for(var i = 1, len = mo.re.groups; i <= len; i++){
                        groups.push(conv(mo.re.$groups[i].item.match_string()))
                    }
                    res.push($B.fast_tuple(groups))
                }
            }else{
                res.push(conv(mo.match_string()))
            }

        }
    },
    finditer: function (){
        var $ = $B.args("finditer", 3,
                    {pattern: null, string: null, flags: null},
                    ['pattern', 'string', 'flags'], arguments,
                    {flags: no_flag}, null, null),
                pattern = $.pattern,
                string = $.string,
                flags = $.flags
        if(_b_.isinstance(string, [_b_.bytearray, _b_.memoryview])){
            string.in_iteration = true
        }
        var original_string = string
        pattern = check_pattern_flags(pattern, flags)
        var data = str_or_bytes(string, pattern),
            pattern = data.pattern,
            string1 = data.string
        return $B.generator.$factory(function*(pattern, string, flags, original_string){
            var result = [],
                pos = 0
            while(pos <= string.length){
                var mo = match(pattern, string, pos, flags)
                if(mo){
                    yield BMatchObject.$factory(mo)
                    if(mo.end == pos){
                        pos++ // at least 1, else infinite loop
                    }else{
                        pos = mo.end
                    }
                }else{
                    pos++
                }
            }
            delete original_string.in_iteration
        })(pattern, string1, flags, original_string)
    },
    match: function(){
        var $ = $B.args("match", 3, {pattern: null, string: null, flags: null},
                    ['pattern', 'string', 'flags'], arguments,
                    {flags: no_flag}, null, null),
                pattern = $.pattern,
                string = $.string,
                flags = $.flags
        pattern = check_pattern_flags(pattern, flags)
        var data = str_or_bytes(string, pattern),
            string = data.string,
            pattern = data.pattern
        var mo = match(pattern, string, 0, flags)
        if(mo === false){
            return _b_.None
        }
        mo.data_type = data.type
        return BMatchObject.$factory(mo)
    },
    search: function(){
        var $ = $B.args("search", 3, {pattern: null, string: null, flags: null},
                    ['pattern', 'string', 'flags'], arguments,
                    {flags: no_flag}, null, null),
                pattern = $.pattern,
                string = $.string,
                flags = $.flags
        pattern = check_pattern_flags(pattern, flags)
        var data = str_or_bytes(string, pattern),
            string = data.string,
            pattern = data.pattern
        var pos = 0
        while(pos < string.length){
            var mo = match(pattern, string, pos, flags)
            mo.data_type = data.type
            if(mo){
                return BMatchObject.$factory(mo)
            }else{
                pos++
            }
        }
        return _b_.None
    },
    split: function(){
        var $ = $B.args("split", 4,
                    {pattern: null, string: null, maxsplit: null, flags: null},
                    ['pattern', 'string', 'maxsplit', 'flags'],
                    arguments, {maxsplit: 0, flags: no_flag}, null, null)
        var res = [],
            pattern = $.pattern,
            pos = 0,
            data = str_or_bytes($.string, pattern),
            nb_split = 0
        if(! (data.pattern instanceof Node)){
            pattern = compile(data.pattern, $.flags)
        }
        for(var bmo of $module.finditer(pattern, $.string)){
            var mo = bmo.mo // finditer returns instances of BMatchObject
            res.push(data.string.substring(pos, mo.start))
            var s = '',
                groups = mo.re.$groups,
                cps,
                has_groups =false
            for(var key in groups){
                has_groups = true
                if(groups[key].num == key){
                    if(groups[key].item.nb_success == 0){
                        if(groups[key].item.repeat && groups[key].item.accepts_failure()){
                            res.push(_b_.None)
                        }else{
                            var m = _b_.None
                            for(var char of groups[key].item.chars){
                                if(char.repeat && char.accepts_failure()){
                                    m = ''
                                    break
                                }
                            }
                            res.push(m)
                        }
                    }else{
                        cps = groups[key].item.match_codepoints
                        if(groups[key].item.repeat){
                            cps = [cps[cps.length - 1]]
                        }
                        res.push(from_codepoint_list(cps))
                    }
                }
            }
            nb_split++
            pos = mo.end
            if(pos >= $.string.length){
                break
            }
            if($.maxsplit != 0 && nb_split >= $.maxsplit){
                break
            }
        }
        res.push(data.string.substring(pos))
        if(data.type === _b_.bytes){
            res = res.map(function(x){return _b_.str.encode(x, "latin-1")})
        }
        return res
    },
    sub: function(){
        var $ = $B.args("sub", 5,
                {pattern: null, repl: null, string: null, count: null, flags: null},
                ['pattern', 'repl', 'string', 'count', 'flags'],
                arguments, {count: 0, flags: no_flag}, null, null),
            pattern = $.pattern,
            repl = $.repl,
            string = $.string,
            count = $.count,
            flags = $.flags
        return subn(string, pattern, repl, count, flags)[0]
    },
    subn: function(){
        var $ = $B.args("sub", 5,
                {pattern: null, repl: null, string: null, count: null, flags: null},
                ['pattern', 'repl', 'string', 'count', 'flags'],
                arguments, {count: 0, flags: no_flag}, null, null),
            pattern = $.pattern,
            repl = $.repl,
            string = $.string,
            count = $.count,
            flags = $.flags
        return $B.fast_tuple(subn(string, pattern, repl, count, flags))
    }

}

var ASCII = $module.A = $module.ASCII = Flag.$factory("ASCII", 256)
var IGNORECASE = $module.I = $module.IGNORECASE = Flag.$factory("IGNORECASE", 2)
var LOCALE = $module.L = $module.LOCALE = Flag.$factory("LOCALE", 4)
var MULTILINE = $module.M = $module.MULTILINE = Flag.$factory("MULTILINE", 8)
var DOTALL = $module.S = $module.DOTALL = Flag.$factory("DOTALL", 16)
var U = $module.U = Flag.$factory("U", 32)
var VERBOSE = $module.X = $module.VERBOSE = Flag.$factory("VERBOSE", 64)

var inline_flags = {
    i: IGNORECASE,
    L: LOCALE,
    m: MULTILINE,
    s: DOTALL,
    u: U,
    x: VERBOSE,
    a: ASCII
}