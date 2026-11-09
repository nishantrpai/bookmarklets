// ==UserScript==
// @name         Journey Slot Highlighter
// @namespace    https://github.com/you
// @version      5.1.0
// @description  Reads a page as a person's journey: where they are and what they're doing, what they want and why, what they've tried, what's at stake, and the constraints and objections in the way. Spots these by sentence structure, not topic keywords.
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════════════
       1. SLOTS
       ════════════════════════════════════════════════════════════════ */

    const SLOTS = [
        { id: 'where',     label: 'Where',     color: '#00acc1', q: 'Who / what situation' },
        { id: 'doing',     label: 'Doing',     color: '#7cb342', q: 'What they do now' },
        { id: 'want',      label: 'Want',      color: '#1e88e5', q: 'What they hope to achieve' },
        { id: 'why',       label: 'Why',       color: '#fb8c00', q: 'Why it matters' },
        { id: 'tried',     label: 'Tried',     color: '#e53935', q: 'What has not worked' },
        { id: 'stakes',    label: 'Stakes',    color: '#8e24aa', q: 'If they do / do not' },
        { id: 'constraint', label: 'Constraint', color: '#ec407a', q: 'Limits, deadlines, budgets, conditions' },
        { id: 'objection', label: 'Objection', color: '#fdd835', q: 'What could stop them' }
    ];
    const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.id, s]));

    const LEVEL_RANK = { explore: 1, desire: 2, goal: 3, specific: 4 };
    const LEVEL_LABEL = {
        explore: 'exploring', desire: 'desire', goal: 'committed goal', specific: 'specific outcome'
    };

    /* ════════════════════════════════════════════════════════════════
       2. ENGINE  (pure functions, no DOM; testable in node)
       ════════════════════════════════════════════════════════════════ */

    // Length-preserving normalisation so offsets still map to the page text.
    function norm(t) {
        return t
            .replace(/[\u2018\u2019\u02bc]/g, "'")
            .replace(/[\u201c\u201d]/g, '"')
            .replace(/[\u00a0\u200b\u2009\u202f]/g, ' ');
    }

    // Sentence gate: first-person present, or bio-style fragment ("Want to get fit.")
    const FP_RE = /\b(?:i|me|my|mine|myself|we|our|ours|im|ive)\b/i;
    const FRAG_RE = /^[\s\W_]*(?:want|wanna|wish|hope|hoping|need|trying|tried|looking|planning|thinking|considering|wondering|currently|recently|struggling|tired|sick|fed\s+up|keep|can't|cannot|working|learning|started|stuck|been|not\s+sure|unsure)\b/i;

    // Subject + adverb scaffolding shared by many rules
    const S = String.raw`\b(?:i|we)(?:'m|'re|'ve|'d|'ll)?(?:\s+(?:am|are|have|had|been|was|were|do|did|would))*\s+`;
    const ADV = String.raw`(?:(?:really|just|still|only|also|definitely|kinda|honestly|desperately|truly|so|badly|always|never|already|currently|actually|literally|even|now|recently|don't|do\s+not|no\s+longer|not|ever|finally|simply|totally|completely|both|all|kind\s+of|sort\s+of|very|super|pretty|quite|rather|extremely|incredibly|fairly|awfully|hella|damn|well|too|[a-z]+ly)\s+)*`;

    // Clause boundaries (a comma inside 10,000 or a colon inside 10:30 is not one)
    const BREAK = /,(?!\d)|[;:](?!\d)|[–—(]|\s-\s|\s(?:but|because|since|which|although|though|while|however|whereas|unless|cause|cuz)\b|\s(?:and|so|then|as)\s+(?:i|we|my|it|that|this|now)\b/gi;

    function capWords(text, start, end, cap) {
        const re = /\S+/g;
        re.lastIndex = start;
        let n = 0, m;
        while ((m = re.exec(text)) && m.index < end) {
            if (++n === cap) return Math.min(end, m.index + m[0].length);
        }
        return end;
    }

    // Span policies: tight = matched frame only; clause = to next boundary; tail = to sentence end
    function extend(text, start, matchEnd, mode, cap) {
        let end = matchEnd;
        if (mode === 'clause') {
            BREAK.lastIndex = matchEnd;
            const b = BREAK.exec(text);
            end = b ? b.index : text.length;
        } else if (mode === 'tail') {
            end = text.length;
        }
        if (mode !== 'tight') end = capWords(text, start, end, cap);
        while (end > matchEnd && /[\s,;:.!?…)"\]-]/.test(text[end - 1])) end--;
        return end;
    }

    // ── Noun-phrase helper for identity frames ("I'm a [dad of 2]") ──
    const NP_STOP = new Set((
        "who whom whose and but or that so because which while when where since after before if " +
        "trying looking wanting hoping wondering thinking planning struggling having going just not " +
        "i my we to is was am are have has had can cant want need been about though although " +
        "currently also still who's i'm i've i'd then"
    ).split(' '));
    const NP_TRAIL = new Set('of with in at on by and a an the for to from'.split(' '));

    function npEnd(t, from, maxTok, exclFirst) {
        const re = /\S+/g;
        re.lastIndex = from;
        const toks = [];
        let m;
        while (toks.length < maxTok && (m = re.exec(t))) {
            const raw = m[0];
            const word = raw.replace(/[,.;:!?)"\]]+$/, '');
            const low = word.toLowerCase().replace(/^[("\[]+/, '');
            if (!low) break;
            if (toks.length === 0 && exclFirst && exclFirst.has(low)) return from;
            if (NP_STOP.has(low)) break;
            toks.push({ low, end: m.index + word.length });
            if (word !== raw) break; // trailing punctuation ends the phrase
        }
        while (toks.length && NP_TRAIL.has(toks[toks.length - 1].low)) toks.pop();
        return toks.length ? toks[toks.length - 1].end : from;
    }

    const WHERE_FIRST_EXCL = new Set(
        'bit little lot big huge real total complete firm sucker mess wreck one only kind type sort fan massive'.split(' '));
    const AS_EXCL = new Set(
        'result rule whole matter side way reminder general consequence bonus heads precaution courtesy friend quick token gift thank'.split(' '));
    const POSS_VETO = new Set((
        'time money idea clue energy motivation choice choices doubt doubts question questions ideas thoughts ' +
        'things points options concerns suggestions tips issues problems reason reasons way ways patience budget ' +
        'space support access minutes mins hours hrs seconds dollars bucks pounds lbs more other different major'
    ).split(' '));
    const PROG_EXCL = new Set((
        'trying looking hoping wondering thinking wanting planning going struggling dealing feeling getting ' +
        'having being worrying failing wishing needing hating dreading considering during according including ' +
        'facing experiencing suffering battling wrestling coping fighting'
    ).split(' '));

    // ── Custom finders (identity frames) ──
    function findAmA(w) {
        const out = [];
        const re = /\b(?:i(?:'m|\s+am)|im|we(?:'re|\s+are))\s+(?:(?:currently|now|still|just|also|recently|newly|only|actually|honestly|basically|technically|officially)\s+)*(?:an?|the)\s+/gi;
        let m;
        while ((m = re.exec(w))) {
            const from = m.index + m[0].length;
            const end = npEnd(w, from, 6, WHERE_FIRST_EXCL);
            if (end > from) out.push({ start: m.index, end });
        }
        return out;
    }

    function findAsA(w) {
        const out = [];
        const re = /\bas\s+an?\s+/gi;
        let m;
        while ((m = re.exec(w))) {
            const before = w.slice(0, m.index).trimEnd();
            if (before && !/[,;:(\-–—.!?]$/.test(before)) continue; // "as a" must open a clause
            const from = m.index + m[0].length;
            const end = npEnd(w, from, 5, AS_EXCL);
            if (end > from) out.push({ start: m.index, end });
        }
        return out;
    }

    function findPossess(w) {
        const out = [];
        const re = /\b(?:have|got|'ve\s+got)\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten|a\s+couple\s+of|a\s+few|no|zero)\s+/gi;
        let m;
        while ((m = re.exec(w))) {
            const from = m.index + m[0].length;
            const first = (w.slice(from).match(/^[\w-]+/) || [''])[0].toLowerCase();
            if (!first || POSS_VETO.has(first)) continue;
            const end = npEnd(w, from, 3, null);
            if (end > from) out.push({ start: m.index, end });
        }
        return out;
    }


    // "my + noun" = something in the person's life ("my saas", "my parents", "my small business").
    // Open-class nouns qualify by default; the CLOSED class of discourse/incidental nouns is excluded instead.
    const MY_MOD = new Set((
        'own new old small little young younger older elderly aging first second third family big main other best ex ' +
        'late former future whole entire tiny large local full-time part-time side solo'
    ).split(' '));
    const MY_SKIP_FIRST = new Set('current daily weekly usual typical normal existing present morning evening'.split(' '));
    const MY_DISCOURSE = new Set((
        // talking about the conversation itself
        'question questions post posts point points opinion opinions understanding thoughts thought guess bad god gosh advice ' +
        'comment comments reply response answer take view views perspective pov experience knowledge belief impression idea ' +
        'ideas suggestion suggestions recommendation thread title edit update mistake apologies fault turn way side case mind ' +
        'head name pleasure honest sake word words example question\'s goal goals plan plans dream dreams problem problems ' +
        // incidental objects / vocatives (not situation)
        'favorite favourite worst biggest phone laptop computer keyboard mouse screen browser tab account password email username friend friends man dude'
    ).split(' '));

    // Speech-act / deixis lead-ins: "here's my…", "let me share my…", "sorry for my…" = talking ABOUT the conversation
    const MY_SPEECH_ACT = /(?:here'?s|here\s+is|that'?s|this\s+is|let\s+me|check(?:\s+out)?|see|read|share|sorry\s+for|thanks?\s+for|thank\s+you\s+for|attached|linked|including|answer|explain|describe|clarify|mention|introduce|take|per)\s+$/i;

    function findMyNoun(w) {
        const out = [];
        const re = /\bmy\s+/gi;
        let m;
        while ((m = re.exec(w))) {
            if (MY_SPEECH_ACT.test(w.slice(Math.max(0, m.index - 22), m.index))) continue;
            let pos = m.index + m[0].length;
            let head = null;
            for (let k = 0; k < 3; k++) {
                const rt = /([A-Za-z][A-Za-z'-]*)/g;
                rt.lastIndex = pos;
                const tm = rt.exec(w);
                if (!tm || tm.index - pos > 1) break;
                const low = tm[1].toLowerCase();
                if (k === 0 && MY_SKIP_FIRST.has(low)) break;      // handled by doing.my_current
                const end = tm.index + tm[1].length;
                if (MY_MOD.has(low)) { pos = end; continue; }
                head = { low, end };
                break;
            }
            if (!head) continue;
            if (NP_STOP.has(head.low) || MY_DISCOURSE.has(head.low) || /ly$/.test(head.low) || head.low.length < 3) continue;
            out.push({ start: m.index, end: head.end });
        }
        return out;
    }


    // ── Bare present-tense action: "I build custom integrations for agencies", "I mainly send cold emails" ──
    // Skeleton: I/we + (adverbs)* + VERB. The verb is open-class, so we EXCLUDE closed classes instead of listing verbs.
    const NOT_ACTION = new Set((
        // function words / negation / frequency adverbs that change polarity
        'the a an to of in on at for with and but or so if that this it my your his her its our their he she they you i we me us ' +
        'them there here not no never always don\'t doesn\'t didn\'t can\'t won\'t wouldn\'t couldn\'t shouldn\'t ' +
        // auxiliaries & modals
        'am is are was were be been being have has had do does did can could will would shall should may might must cannot ' +
        // stative / cognition / source / speech verbs (not "an action they take")
        'think know believe feel wonder agree disagree guess suppose mean doubt trust remember forget understand realize realise ' +
        'notice figure see hear look seem appear belong own like love hate prefer say tell ask mention suggest recommend promise ' +
        'swear bet read heard saw found watched learned discovered ' +
        // emotive / evaluative / speech-act verbs
        'appreciate thank apologize apologise regret admit confess enjoy miss fear worry envy respect value dislike adore ' +
        // control verbs: they have their own slot rules (WANT / TRIED / goal)
        'try attempt begin start keep stop quit plan intend decide hope want need wish dream'
    ).split(' '));
    // Irregular PAST forms (closed set). Ambiguous ones (set, put, cut, hit, read, quit, let, shut, hurt, cost, bet, spread) are left out.
    const IRREG_PAST = new Set((
        'went came made took gave got sent wrote bought spent ran sold built lost found told left kept paid met drew drove ate fell ' +
        'flew forgot began sang swam threw wore won saw said brought taught caught fought chose grew led withdrew shot knew thought ' +
        'felt heard held sat stood slept spoke stole shook slid spun stuck stung struck swore swept swung tore understood woke wove ' +
        'bent bled blew broke bred dealt dug fed fled forgave froze hid hung lay lent lit meant overtook rode rang rose sought shone ' +
        'shrank sank spat sprang strove swelled wept wound wrung'
    ).split(' '));
    const NOT_ED = new Set('need feed speed seed bleed breed proceed succeed exceed indeed bed red shed sled'.split(' '));
    function isPastForm(v) {
        if (/ed$/.test(v) && !NOT_ED.has(v)) return true;
        const stripped = v.replace(/^(?:re|over|under|out|mis|un|up|down|with|fore)/, '');
        return IRREG_PAST.has(v) || IRREG_PAST.has(stripped);
    }


    // Sentence opens with a PAST-tense verb and no subject ("Started my agency", "Lost 20 lbs in 3 months").
    // Imperatives use the base form, so a past form at the start means a dropped "I" (diary / bio / title style).
    function droppedSubjectPast(sentence) {
        const m = sentence.match(/^[^A-Za-z]*([A-Za-z]+)\b(?!')/);
        if (!m) return false;
        const v = m[1].toLowerCase();
        return v.length >= 3 && !NOT_ACTION.has(v) && isPastForm(v);
    }

    function findPresentAction(w) {
        const out = [];
        const re = /\b(?:i|we)\s+((?:(?:[a-z]+ly|just|still|also|really|often|even|now|already|both|all|actually|currently)\s+)*)([a-z]+)\b(?!')/gi;
        let m;
        while ((m = re.exec(w))) {
            const v = m[2].toLowerCase();
            if (v.length < 3 || NOT_ACTION.has(v) || /ing$/.test(v) || isPastForm(v)) continue;
            out.push({ start: m.index, end: extend(w, m.index, m.index + m[0].length, 'clause', 12) });
        }
        return out;
    }

    // ── Rule construction ──
    function R(slot, id, src, o = {}) {
        return {
            slot, id,
            re: new RegExp(src, o.flags || 'gi'),
            span: o.span || 'clause',
            cap: o.cap || 12,
            gate: o.gate || 'fp',
            level: o.level || null,
            veto: o.veto || null,
            trimLead: !!o.trimLead
        };
    }
    function F(slot, id, find, gate) { return { slot, id, find, gate: gate || 'fp' }; }

    const WANT_DESIRE =
        `${S}${ADV}(?:want|wanna|wish|hope|need|crave|desire|dream\\s+of|dream\\s+about|long\\s+to|long\\s+for|aspire\\s+to|` +
        `would\\s+(?:really\\s+)?(?:like|love)|hoping(?:\\s+to|\\s+for|\\s+that)?|looking\\s+to|wishing(?:\\s+to|\\s+for)?|dreaming\\s+of)\\b` +
        `|\\b(?:i|we)'d\\s+(?:really\\s+|just\\s+)?(?:like|love)\\b`;

    const WANT_GOAL =
        String.raw`\b(?:my|our)\s+(?:(?:main|ultimate|current|new|big|only|biggest|first|real)\s+)?(?:goal|aim|target|dream|objective|mission|resolution|plan)\s+(?:is|was|for|this)\b` +
        `|${S}${ADV}(?:going\\s+to|gonna|planning\\s+to|plan\\s+to|aiming\\s+to|aim\\s+to|intend\\s+to|intending\\s+to|working\\s+towards?|` +
        `determined\\s+to|committed\\s+to|set\\s+on|setting\\s+out\\s+to|trying\\s+to(?!\\s+(?:figure|decide|understand|find\\s+out))|attempting\\s+to|ready\\s+to|about\\s+to)`;

    const WANT_EXPLORE =
        `${S}${ADV}(?:thinking\\s+(?:about|of|if)|considering|wondering(?:\\s+(?:if|whether|how|what|about|why))?|` +
        `curious(?:\\s+(?:about|if|whether|how|what))?|exploring|open\\s+to|interested\\s+in|looking\\s+(?:for|into|at)|researching|` +
        `not\\s+sure(?:\\s+(?:if|whether|how|what|where|which|about))?|unsure|figuring\\s+out|` +
        `trying\\s+to\\s+(?:figure|decide|understand|find\\s+out)|debating|torn|deciding|can't\\s+decide|cannot\\s+decide|confused\\s+(?:about|by|on))`;

    // Present perfect ("I've written a book") = done-so-far. English irregular participles are a closed set.
    const PP_IRREG = 'written|built|made|done|begun|run|sold|won|found|taken|given|become|grown|kept|left|paid|put|set|spent|' +
        'brought|bought|taught|chosen|drawn|driven|eaten|fallen|flown|forgotten|gone|hidden|held|led|met|quit|ridden|risen|' +
        'sent|shown|sung|slept|spoken|stood|stolen|swum|thrown|worn|told|lost|saved|cut|read|hit|beaten|broken|caught|fought';
    // People often use the PAST form where the participle belongs ("I've ran", "I've wrote", "I've went")
    const PP_INFORMAL = 'ran|wrote|went|did|took|gave|began|drove|ate|fell|flew|chose|grew|rose|spoke|stole|wore|threw|broke';
    // -ed words that are states/feelings/other slots, not accomplishments
    const PP_ED_EXCL = 'tried|attempted|failed|wanted|needed|wished|hoped|liked|loved|hated|used|worried|noticed|realized|realised|' +
        'seemed|looked|appeared|supposed|started|joined|enrolled|picked|signed';
    const PERFECT =
        String.raw`\b(?:i|we)(?:'ve|\s+have)\s+(?:(?:just|recently|finally|already|actually|also|successfully|slowly|barely|almost|only)\s+)*` +
        `(?:(?!(?:${PP_ED_EXCL})\\b)[a-z]{2,}ed|${PP_IRREG}|${PP_INFORMAL})\\b`;

    const RULES = [
        // ── WHERE: identity & situation (tight frames, never whole sentences) ──
        F('where', 'where.i_am_a', findAmA),
        F('where', 'where.as_a', findAsA),
        F('where', 'where.have_N', findPossess),
        F('where', 'where.my_noun', findMyNoun),
        R('where', 'where.age_im',
            String.raw`\b(?:i(?:'m|\s+am)|im)\s+\d{2}(?:\s*(?:years?\s+old|yo|y\/o|yrs?\s+old))?\b(?!\s*(?:%|\$|k\b|lbs?|kg|minutes?|mins?|hours?|hrs?|miles?|days?|weeks?|months?|pounds|times))`,
            { span: 'tight' }),
        R('where', 'where.age_yo', String.raw`\b\d{2}[\s-]?(?:years?[\s-]?old|yo|y\/o)\b`, { span: 'tight' }),
        R('where', 'where.28M', String.raw`(^|[\s(\[])(\d{2}\s?[MF])(?=$|[\s)\].,!?:\/])`,
            { flags: 'g', span: 'tight', gate: 'none', trimLead: true }),
        R('where', 'where.decade',
            String.raw`\bin\s+my\s+(?:(?:early|mid|late)[\s-])?(?:\d0s|twenties|thirties|forties|fifties|sixties)\b`,
            { span: 'tight', gate: 'none' }),
        R('where', 'where.family_of_N',
            String.raw`\b(?:dad|father|mom|mum|mama|mother|parent|papa|grandma|grandpa|stepdad|stepmom)\s+of\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s+(?:kids|children|boys|girls|cats|dogs))?`,
            { span: 'tight', gate: 'none' }),
        R('where', 'where.situation_verb',
            String.raw`\b(?:i|we)\s+(?:(?:currently|also|still|now|only|just|both|full[- ]time)\s+)*(?:work(?!\s+(?:out|on)\b)|live|study|teach|own|manage|commute|run(?=\s+(?:an?|my|the|our)\b))\b`,
            { cap: 7 }),

        // ── DOING: ongoing / habitual present ──
        R('doing', 'doing.progressive',
            String.raw`\b(?:i(?:'m|\s+am)?|we(?:'re|\s+are)?|i(?:'ve|\s+have)\s+been|we(?:'ve|\s+have)\s+been|i\s+been|we\s+been)\s+(?:(?:currently|now|still|also|just|already|actually|slowly|mostly|always|even|really|only|recently|finally)\s+)*([a-z][a-z-]*ing)\b`,
            { veto: m => PROG_EXCL.has(m[1].toLowerCase()) }),
        R('doing', 'doing.habitual',
            String.raw`\b(?:i|we)\s+(?:usually|normally|typically|mostly|generally|daily|weekly|often|regularly|sometimes|currently)\s+(?!want\b|need\b|wish\b|hope\b|feel\b|think\b|know\b|wonder\b)\w+`,
            { cap: 10 }),
        R('doing', 'doing.currently',
            String.raw`\b(?:currently|right\s+now|at\s+the\s+moment|these\s+days|lately)\b(?!\s*,?\s*(?:i|we)\s+(?:really\s+|just\s+)?(?:want|need|wish|hope|would))`,
            { cap: 10 }),
        R('doing', 'doing.every', String.raw`\b(?:every|each)\s+(?:day|morning|evening|night|week|weekend|month)\b`, { cap: 10 }),
        R('doing', 'doing.my_current',
            String.raw`\bmy\s+(?:current|daily|weekly|usual|typical|normal|existing|present|morning|evening)\s+[\w-]+`,
            { cap: 10 }),
        R('doing', 'doing.started',
            String.raw`\b(?:i|we)(?:'ve|\s+have)?\s+(?:(?:just|recently|finally|only|also|actually)\s+)*(?:started|begun|began|picked\s+up|got\s+into|got\s+started|joined|signed\s+up(?:\s+for)?|enrolled)\b`,
            { cap: 10 }),
        R('doing', 'doing.perfect', PERFECT, { cap: 14 }),
        F('doing', 'doing.present_action', findPresentAction),

        // ── WANT: one slot, graded by specificity (explore < desire < goal < specific) ──
        R('want', 'want.desire', WANT_DESIRE, {
            level: 'desire', cap: 14,
            veto: m => /(?:don't|do\s+not|not|no\s+longer)\s+(?:\w+\s+)*(?:need|hope|wish|crave|desire)\b/i.test(m[0]) ||
                /^\s*(?:to\s+)?(?:say|mention|add|note|admit|clarify|ask|point\s+out|apologi[sz]e|thank|stress|emphasi[sz]e|confess|be\s+honest)\b/i.test(m.input.slice(m.index + m[0].length))
        }),
        R('want', 'want.goal', WANT_GOAL, { level: 'goal', cap: 14 }),
        R('want', 'want.explore', WANT_EXPLORE, { level: 'explore', cap: 14 }),
        R('want', 'want.q_how_do_i', String.raw`\b(?:how|what|where|which|when)\s+(?:do|can|should|would|could|did|does|am)\s+(?:i|we)\b`,
            { level: 'explore', span: 'tail', cap: 14 }),
        R('want', 'want.should_i', String.raw`\bshould\s+(?:i|we)\b`, { level: 'explore', span: 'tail', cap: 12 }),
        R('want', 'want.ask_help',
            String.raw`\b(?:(?:any|some)\s+(?:advice|tips|ideas|suggestions|recommendations|thoughts|insights?|guidance|pointers)|(?:anyone|anybody|someone)\s+(?:have|has|got|know|else|tried|with|here|out\s+there|who)\b[^.!?]{0,40})`,
            { level: 'explore', gate: 'none', cap: 10 }),
        R('want', 'want.help_me', String.raw`\bhelp\s+me\b`, { level: 'explore', cap: 10 }),

        // ── WHY: causal connectives, affect/pain, patterns, trigger events ──
        R('why', 'why.connective',
            String.raw`\b(?:because(?:\s+of)?|since|so\s+that|so\s+(?:i|we)\s+(?:can|could|won't|don't|will|would)|in\s+order\s+to|which\s+is\s+why|that(?:'s|\s+is)\s+why|the\s+reason\s+(?:is|i|why)|due\s+to|ever\s+since|after\s+(?:i|we|my|our|a|an|the|having|being)|my\s+(?:doctor|dr|wife|husband|boss|partner|therapist|trainer|coach|mom|dad|mother|father|kid|kids|son|daughter|girlfriend|boyfriend|friend|manager)\s+(?:said|told|says|asked|thinks|suggested|recommended))\b`,
            { span: 'tail', cap: 18 }),
        // "as I ran Meta ads" = because/since. A causal "as" is followed directly by a subject; comparative, temporal and discourse uses are vetoed.
        R('why', 'why.as_because', String.raw`\bas\s+(?:i|we)(?:'ve|'m|'d|'ll)?\b`, {
            span: 'clause', cap: 14,
            veto: m => {
                const before = m.input.slice(0, m.index);
                const after = m.input.slice(m.index + m[0].length);
                if (/\b(?:just|such|same|so|twice|half|not|quite|exactly)\s+$/i.test(before)) return true;      // "just as I thought", "such as I"
                if (/\bas\s+(?:\w+\s+)?$/i.test(before)) return true;                                            // "as soon as I can", "as well as I do"
                if (/^\s+(?:was|were)\s+\w+ing\b/i.test(after)) return true;                                      // temporal: "as I was walking"
                if (/^\s+(?:said|mentioned|noted|stated|explained|wrote|expected|thought|see|saw|know|knew|understand|recall|requested|promised|discussed|told|asked|suggested|hoped|mean|can|could|would|should|must|will|need|want)\b/i.test(after)) return true; // discourse / modal
                return false;
            }
        }),
        // Progressive pain: "I'm struggling with…", "we're dealing with…", "I'm having trouble…"
        R('why', 'why.pain_progressive',
            String.raw`\b(?:i(?:'m|\s+am)|we(?:'re|\s+are)|i(?:'ve|\s+have)\s+been|we(?:'ve|\s+have)\s+been)\s+(?:(?:currently|still|really|constantly|always)\s+)*(?:facing|dealing\s+with|struggling(?:\s+with)?|battling|wrestling\s+with|coping\s+with|suffering\s+from|running\s+into|experiencing|having\s+(?:trouble|issues|problems|a\s+hard\s+time))`,
            { cap: 12 }),
        // Owned problem statement: "my main problem is…", "the issue that I'm facing is…"
        R('why', 'why.problem_statement',
            String.raw`\b(?:my|our)\s+(?:(?:main|biggest|real|only|current|major|big|first|core)\s+)?(?:issue|problem|challenge|struggle|bottleneck|roadblock|obstacle|pain\s+point|concern|blocker)s?\b` +
            String.raw`|\bthe\s+(?:(?:main|biggest|real|only|current|major|big|first|core)\s+)?(?:issue|problem|challenge|struggle|bottleneck|roadblock|obstacle|pain\s+point|concern|blocker)s?\s+(?:that\s+)?(?:i|we)(?:'m|'re|\s+am|\s+are|'ve|\s+have)?\b`,
            { cap: 14 }),
        R('why', 'why.affect',
            String.raw`\b(?:tired|sick|fed\s+up|bored|scared|afraid|worried|embarrassed|ashamed|frustrated|stuck|overwhelmed|burn(?:ed|t)\s+out|exhausted|stressed|anxious|miserable|desperate|terrified|dreading|dread|hate|hating|can't\s+stand|cannot\s+stand)\b(?:\s+(?:of|with|about|by|in|that|to))?`,
            { cap: 10 }),
        R('why', 'why.pattern',
            String.raw`\b(?:i|we)\s+(?:just\s+|still\s+|really\s+|literally\s+)*(?:can(?:'t|not)\s+(?:stop|quit|help)|can't\s+seem\s+to|cannot\s+seem\s+to|never\s+seem\s+to|always\s+end\s+up|always\s+seem\s+to|struggle\s+(?:to|with)|have\s+trouble|have\s+a\s+hard\s+time|find\s+it\s+(?:hard|difficult|impossible)|don't\s+know\s+how\s+to|have\s+no\s+idea\s+(?:how|what|where)|have\s+no\s+(?:energy|motivation)|feel\s+(?:so|stuck|lost|trapped|helpless|hopeless|behind|like\s+(?:i|a\s+failure|giving|nothing)))`,
            { cap: 10 }),
        R('why', 'why.trigger',
            String.raw`\b(?:i|we)\s+(?:just\s+|recently\s+|finally\s+|suddenly\s+)?(?:found\s+out|realized|realised|noticed|discovered|woke\s+up\s+to|was\s+told|got\s+told|was\s+diagnosed|got\s+diagnosed|got\s+laid\s+off|was\s+laid\s+off|got\s+fired|lost\s+my|had\s+a\s+(?:scare|wake-up\s+call))\b`,
            { cap: 14 }),

        // ── TRIED: past attempts and failure markers ──
        R('tried', 'tried.tried',
            String.raw`\b(?:i|we)(?:'ve|\s+have)?\s+(?:(?:already|also|even|literally|actually|previously|honestly|once|twice|just|really|personally|all)\s+)*(?:tried|attempted)\b`,
            { cap: 14 }),
        R('tried', 'tried.failure',
            String.raw`\b(?:(?:didn't|did\s+not|never|hasn't|has\s+not|haven't|wasn't|couldn't)\s+(?:(?:really|ever|actually|seem\s+to|even|quite|long\s+term|long-term)\s+)*(?:work|worked|help|helped|stick|last|click|fix|change|hold|translate|get\s+results|see\s+results)|(?:doesn't|does\s+not|don't|do\s+not|isn't|won't)\s+(?:(?:really|ever|actually|seem\s+to|even|quite)\s+)*(?:work|help|stick|last)|no\s+(?:luck|results?|progress|change|improvement|difference)|(?:nothing|none\s+of\s+(?:it|them|that|these|those))\s+(?:has\s+|have\s+|ever\s+|really\s+)*(?:work(?:s|ed)?|help(?:s|ed)?|stick(?:s)?|stuck)|gave\s+up|give\s+up\s+on|fell\s+off(?:\s+the\s+wagon)?|fell\s+back|relapsed|wasted|failed(?:\s+to|\s+at|\s+every)?|back\s+to\s+square\s+one|can(?:'t|not)\s+(?:seem\s+to\s+)?stick|couldn't\s+stick|keep(?:s)?\s+(?:failing|quitting|falling|relapsing|giving|forgetting|starting|restarting))`,
            { cap: 10, veto: m => /\bif\s+(?:i|we)\s+(?:\w+\s+){0,2}$/i.test(m.input.slice(0, m.index)) }),

        // Outcome of an attempt: "they botched", "my launch flopped", "didn't convert". Past forms only (avoids nouns like "tank").
        R('tried', 'tried.failed_outcome',
            String.raw`\b(?:(?:they|it|that|those|these|all\s+of\s+them|everything)\s+)?(?:botched|flopped|bombed|tanked|crashed|fizzled|backfired|imploded|stalled|underperformed|flatlined|sputtered|floundered|misfired|fell\s+flat|went\s+nowhere|got\s+nowhere|went\s+south|(?:didn't|did\s+not)\s+(?:convert|land|take\s+off|perform)|never\s+(?:converted|took\s+off|performed))\b`,
            { cap: 8 }),

        // ── STAKES: conditionals, fears, future-self ──
        R('stakes', 'stakes.conditional',
            String.raw`\bif\s+(?:i|we)\s+(?:(?:really|just|still|ever|actually)\s+)*(?:don't|do\s+not|can't|cannot|never|keep|continue|stay|fail|miss|lose)\b` +
            String.raw`|\bif\s+nothing\s+changes\b|\b(?:otherwise|or\s+else|before\s+it's\s+too\s+late|before\s+it\s+gets\s+worse)\b` +
            String.raw`|\b(?:i'm|i\s+am|we're|we\s+are)\s+(?:so\s+|really\s+|just\s+)?(?:afraid|scared|worried|terrified)\s+(?:that\s+)?(?:i|we|it|this|my|she|he|they|people|everyone)\b` +
            String.raw`|\b(?:i|we)'ll\s+(?:never|end\s+up|be\s+stuck|lose|regret|miss|die|be\s+alone|be\s+broke|be\s+unable)\b` +
            String.raw`|\b(?:i|we)\s+(?:won't|will\s+not|wouldn't|would\s+never)\s+be\s+able\b` +
            String.raw`|\b(?:i|we)'d\s+(?:finally|actually|be\s+able|get\s+to|never\s+have\s+to|be\s+so|be\s+free|feel|have\s+more)\b` +
            String.raw`|\b(?:i|we)\s+(?:could|would)\s+finally\b|\bimagine\s+(?:being|if|having|not|waking)\b` +
            String.raw`|\bwhat\s+if\s+(?:i|we)\b|\bwhen\s+(?:i|we)\s+finally\b|\bone\s+day\s+(?:i|we)\b`,
            { span: 'tail', cap: 16 }),

        // ── CONSTRAINT: limits, deadlines, budgets and conditions ──
        R('constraint', 'constraint.time_limit',
            String.raw`\b(?:within|by|before|no later than|in the next|over the next|for the next)\s+(?:(?:next|coming)\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|few|couple of)\s+(?:days?|weeks?|months?|years?|hours?|minutes?)\b`,
            { cap: 12 }),
        R('constraint', 'constraint.budget_limit',
            String.raw`\b(?:under|below|within|less than|no more than|at most|up to|maximum of|a maximum of)\s+(?:[$£€₹]\s*\d[\d,.]*\s*k?|\d[\d,.]*\s*(?:dollars?|bucks|rupees?|inr|usd|k|grand|(?:a|per)\s+(?:month|week|year)|\/(?:mo|month|week|yr)))\b`,
            { cap: 10 }),
        R('constraint', 'constraint.quantity_limit',
            String.raw`\b(?:only|just|at most|no more than|up to|maximum of|limited to)\s+(?:(?:have|get|got|spend|spare|do|work|manage|afford|use)\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|sessions?|times?|people|items?|steps?)\b`,
            { cap: 10 }),
        R('constraint', 'constraint.availability',
            String.raw`\b(?:only|just)\s+(?:on|during|after|before|between|at)\s+(?:weekdays?|weekends?|mornings?|afternoons?|evenings?|nights?|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?)\b`,
            { cap: 10 }),
        R('constraint', 'constraint.condition',
            String.raw`\b(?:as long as|provided that|on the condition that|without\s+(?:increasing|exceeding|spending|using|requiring|adding|sacrificing|compromising)|while keeping|subject to)\b`,
            { span: 'tail', cap: 14 }),

        // ── OBJECTION: barriers (time / money / trust / effort / fit) ──
        R('objection', 'objection.barrier',
            String.raw`\b(?:(?:can't|cannot|couldn't|can\s+not)\s+(?:really\s+)?afford|(?:don't|do\s+not|doesn't|didn't|haven't)\s+(?:really\s+)?(?:have|got)\s+(?:the\s+|any\s+|enough\s+|much\s+)?(?:time|money|budget|energy|space|support|access|funds|cash|patience)|(?:no|not\s+enough|limited|little|zero)\s+(?:time|money|budget|energy|space|support|funds|cash|patience)|too\s+(?:expensive|busy|old|late|much|hard|difficult|complicated|risky|tired|broke|young|slow|far|overwhelming)|(?:won't|wouldn't|doesn't|not\s+going\s+to)\s+(?:work|fit|apply)\s+(?:for\s+me|in\s+my)|too\s+late\s+for\s+me|only\s+if|without\s+having\s+to|not\s+willing\s+to|(?:don't|do\s+not)\s+know\s+where\s+to\s+start|where\s+do\s+i\s+(?:even\s+)?start)`,
            { cap: 10 }),
        R('objection', 'objection.skeptic',
            String.raw`\b(?:too\s+good\s+to\s+be\s+true|scam|scammy|snake\s+oil|gimmick|gimmicky|pyramid\s+scheme|skeptical|sceptical|(?:don't|do\s+not)\s+(?:really\s+)?(?:trust|believe)|what's\s+the\s+catch|(?:is|does|do|are)\s+(?:it|this|that|they)\s+(?:actually|really|even)\s+(?:work|worth|legit|real))\b`,
            { gate: 'none', cap: 10 })
    ];

    // ── Sentence splitting ──
    function splitSentences(text) {
        const out = [];
        const re = /[.!?]+(?=\s|$)|\n+/g;
        let last = 0, m;
        while ((m = re.exec(text))) {
            const end = m.index + m[0].length;
            out.push([last, end]);
            last = end;
        }
        if (last < text.length) out.push([last, text.length]);
        return out;
    }

    function runRule(rule, work) {
        if (rule.find) return rule.find(work);
        const out = [];
        const re = rule.re;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(work))) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            if (rule.veto && rule.veto(m)) continue;
            const start = rule.trimLead ? m.index + m[1].length : m.index;
            const end = extend(work, start, m.index + m[0].length, rule.span, rule.cap);
            out.push({ start, end, level: rule.level });
        }
        return out;
    }

    const SPECIFIC_RE = /\d|\b(?:by|before|within)\s+(?:next|the\s+end|this|january|february|march|april|may|june|july|august|september|october|november|december|summer|winter|spring|fall|christmas)\b/i;

    function analyze(raw) {
        const text = norm(raw || '');
        const spans = [];

        for (const [ss, se] of splitSentences(text)) {
            const s = text.slice(ss, se);
            if (s.trim().length < 4) continue;

            let mode = FP_RE.test(s) ? 'fp' : (FRAG_RE.test(s) ? 'frag' : 'none');
            if (mode !== 'frag' && droppedSubjectPast(s)) mode = 'frag'; // "Started my agency" (has "my", but no subject)
            const work = mode === 'frag' ? 'I ' + s : s; // virtual subject for dropped-subject fragments
            const shift = mode === 'frag' ? 2 : 0;

            for (const rule of RULES) {
                if (mode === 'none' && rule.gate !== 'none') continue;
                for (const h of runRule(rule, work)) {
                    let a = Math.max(0, h.start - shift);
                    let b = h.end - shift;
                    while (a < b && /\s/.test(s[a])) a++;
                    while (b > a && /\s/.test(s[b - 1])) b--;
                    if (b - a < 3) continue;
                    spans.push({ slot: rule.slot, rule: rule.id, start: ss + a, end: ss + b, level: h.level || rule.level });
                }
            }
        }
        return finalize(text, spans);
    }

    // Merge overlapping spans within the same slot; derive WANT level.
    function finalize(text, spans) {
        spans.sort((a, b) => a.start - b.start || b.end - a.end);
        const out = [];
        const lastBySlot = {};
        for (const sp of spans) {
            const prev = lastBySlot[sp.slot];
            if (prev && sp.start < prev.end) {
                if (sp.end > prev.end) prev.end = sp.end;
                prev.rules.add(sp.rule);
                if ((LEVEL_RANK[sp.level] || 0) > (LEVEL_RANK[prev.level] || 0)) prev.level = sp.level;
                continue;
            }
            const n = { slot: sp.slot, start: sp.start, end: sp.end, level: sp.level, rules: new Set([sp.rule]) };
            out.push(n);
            lastBySlot[sp.slot] = n;
        }
        for (const sp of out) {
            sp.text = text.slice(sp.start, sp.end);
            sp.rules = [...sp.rules];
            if (sp.slot === 'want' && SPECIFIC_RE.test(sp.text)) sp.level = 'specific';
            if (sp.slot !== 'want') sp.level = null;
        }
        return { spans: out, slots: [...new Set(out.map(s => s.slot))] };
    }

    /* ════════════════════════════════════════════════════════════════
       3. DOM HELPERS  (also exported for jsdom tests)
       ════════════════════════════════════════════════════════════════ */

    const MIN_LEN = 20;
    const SKIP_SEL = 'script,style,noscript,textarea,input,select,svg,canvas,pre,code,nav,footer,button,' +
                     '[contenteditable="true"],[role="navigation"],[hidden],#jh-root';
    const BLOCK_SEL = 'address,article,aside,blockquote,details,dialog,div,dl,fieldset,figure,footer,form,' +
                      'h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tr,td,th,ul,video,iframe';

    // A "text block" = outermost element that holds inline content only.
    // (Tweet text, <p>, <li>, comment bodies...) — works without site-specific selectors.
    function collectBlocks(root) {
        const out = [];
        const stack = [root];
        while (stack.length) {
            const el = stack.pop();
            if (!el || el.nodeType !== 1) continue;
            if (el.matches(SKIP_SEL)) continue;
            if (!el.querySelector(BLOCK_SEL)) {
                const n = (el.textContent || '').trim().length;
                if (n >= MIN_LEN) out.push(el);
                continue; // inline-only subtree: either a block or too short to matter
            }
            for (let c = el.lastElementChild; c; c = c.previousElementSibling) stack.push(c);
        }
        return out;
    }

    // Flatten a block into text + node offsets. <br> counts as "\n".
    function textItems(block) {
        const items = [];
        let off = 0;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode(n) {
                if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
                if (n.tagName === 'BR') return NodeFilter.FILTER_ACCEPT;
                if (n.matches('script,style,noscript,svg,[hidden]')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_SKIP;
            }
        });
        let n;
        while ((n = walker.nextNode())) {
            if (n.nodeType === 3) {
                items.push({ node: n, start: off, end: off + n.data.length, text: n.data });
                off += n.data.length;
            } else {
                items.push({ br: true, start: off, end: off + 1, text: '\n' });
                off += 1;
            }
        }
        return { items, text: items.map(i => i.text).join('') };
    }

    function rangeFor(items, a, b) {
        let sn = null, so = 0, en = null, eo = 0;
        for (const it of items) {
            if (it.br) continue;
            if (!sn && a >= it.start && a < it.end) { sn = it.node; so = a - it.start; }
            if (b > it.start && b <= it.end) { en = it.node; eo = b - it.start; break; }
        }
        if (!sn || !en) return null;
        const r = document.createRange();
        try { r.setStart(sn, so); r.setEnd(en, eo); } catch (e) { return null; }
        return r;
    }

    function hash(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return s.length + ':' + h;
    }

    /* ════════════════════════════════════════════════════════════════
       4. EXPORTS FOR TESTS (node) — UI below only runs in a browser
       ════════════════════════════════════════════════════════════════ */

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { analyze, SLOTS, collectBlocks, textItems, rangeFor, splitSentences, RULES };
        return;
    }
    if (typeof document === 'undefined') return;

    window.__journeyAnalyze = analyze; // handy for console debugging

    const HAS_HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

    /* ════════════════════════════════════════════════════════════════
       5. STATE + HIGHLIGHTING (CSS Custom Highlight API: zero DOM edits)
       ════════════════════════════════════════════════════════════════ */

    const registry = new Map(); // block -> { key, records:[{slot,level,text,range}], slots, text }
    let enabled = loadEnabled();
    const HISTORY_KEY = 'jh:history';
    let historyEntries = [];
    let historyIndex = new Map();
    const historyEnabled = new Set(SLOTS.map(s => s.id));
    let host = null, shadow = null, panelOpen = false, currentTab = 'current', historyQuery = '';
    const historyReady = loadHistory().then(entries => {
        historyEntries = entries;
        historyIndex = new Map(entries.map(item => [item.key, item]));
        renderUI();
    }).catch(error => {
        console.warn('[journey] history initialization failed', error);
        renderUI();
    });

    function loadEnabled() {
        try {
            const v = JSON.parse(localStorage.getItem('jh:enabled'));
            if (Array.isArray(v)) return new Set(v);
        } catch (e) { /* storage may be blocked */ }
        return new Set(SLOTS.map(s => s.id));
    }
    function saveEnabled() {
        try { localStorage.setItem('jh:enabled', JSON.stringify([...enabled])); } catch (e) { /* ignore */ }
    }
    function isWebUrl(value) {
        try {
            const protocol = new URL(value).protocol;
            return protocol === 'http:' || protocol === 'https:';
        } catch (e) { return false; }
    }
    function historyKey(slot, text) {
        return `${slot}|${text.replace(/\s+/g, ' ').trim().toLocaleLowerCase()}`;
    }
    async function readStoredHistory() {
        if (typeof GM_getValue === 'function') {
            const shared = await GM_getValue(HISTORY_KEY, []);
            try {
                const local = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
                return Array.isArray(local) ? [...(Array.isArray(shared) ? shared : []), ...local] : shared;
            } catch (e) {
                return shared;
            }
        }
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch (e) {
            console.warn('[journey] could not read history', e);
            return [];
        }
    }

    async function loadHistory() {
        let value;
        try {
            value = await readStoredHistory();
        } catch (e) {
            console.warn('[journey] could not read userscript history storage', e);
            try { value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
            catch (fallbackError) {
                console.warn('[journey] could not read local history storage', fallbackError);
                return [];
            }
        }
        if (!Array.isArray(value)) return [];
        const loaded = new Map();
        for (const entry of value) {
            if (!entry || typeof entry.text !== 'string') continue;
            const sources = Array.isArray(entry.sources) ? entry.sources : (
                typeof entry.url === 'string' ? [{
                    url: entry.url,
                    title: entry.title || '',
                    context: entry.text,
                    firstSeen: entry.firstSeen || Date.now()
                }] : []
            );
            const slots = typeof entry.slot === 'string' ? [entry.slot] :
                (Array.isArray(entry.slots) ? entry.slots : []);
            for (const slot of slots) {
                if (!SLOT_MAP[slot]) continue;
                const key = historyKey(slot, entry.text);
                let item = loaded.get(key);
                if (!item) {
                    item = { key, slot, level: entry.level || '', text: entry.text, sources: [] };
                    loaded.set(key, item);
                }
                for (const source of sources) {
                    if (!source || typeof source.url !== 'string' || !isWebUrl(source.url)) continue;
                    const existing = item.sources.find(saved => saved.url === source.url);
                    if (!existing) {
                        const saved = {
                            url: source.url,
                            title: typeof source.title === 'string' ? source.title : '',
                            firstSeen: source.firstSeen || entry.firstSeen || Date.now()
                        };
                        if (typeof source.context === 'string') saved.context = source.context;
                        item.sources.push(saved);
                    }
                }
            }
        }
        return [...loaded.values()].filter(item => item.sources.length);
    }

    async function saveHistory() {
        if (typeof GM_setValue === 'function') {
            await GM_setValue(HISTORY_KEY, historyEntries);
            return;
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
    }

    async function rememberHistory() {
        let changed = false;
        const url = location.href;
        const title = document.title;
        const now = Date.now();
        for (const [blk, ent] of registry) {
            if (!blk.isConnected || !ent.slots.length) continue;
            for (const record of ent.records) {
                const text = record.text.replace(/\s+/g, ' ').trim();
                if (!text || !SLOT_MAP[record.slot]) continue;
                const key = historyKey(record.slot, text);
                let item = historyIndex.get(key);
                if (!item) {
                    item = { key, slot: record.slot, level: record.level || '', text, sources: [] };
                    historyEntries.unshift(item);
                    historyIndex.set(key, item);
                    changed = true;
                }
                let source = item.sources.find(saved => saved.url === url);
                if (!source) {
                    item.sources.push({ url, title, firstSeen: now });
                    changed = true;
                } else if (source.title !== title) {
                    source.title = title;
                    changed = true;
                }
            }
        }
        if (changed) {
            try { await saveHistory(); }
            catch (e) { console.warn('[journey] could not save history', e); }
        }
    }

    function renderHistory() {
        if (!shadow || currentTab !== 'history') return;
        const query = historyQuery;
        const matches = historyEntries.filter(item => {
            if (!historyEnabled.has(item.slot)) return false;
            const sources = item.sources.map(source =>
                `${source.title || ''} ${source.url} ${source.context || ''}`).join(' ');
            return !query || `${item.text} ${sources}`.toLocaleLowerCase().includes(query);
        });
        const list = shadow.querySelector('.list');
        list.innerHTML = '';
        if (!matches.length) {
            list.textContent = '';
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = historyEntries.length ? 'No history matches your search and filters.' : 'No highlights saved yet. Highlighted passages will appear here.';
            list.appendChild(empty);
            return;
        }
        for (const item of matches) {
            const row = document.createElement('div');
            row.className = 'row';
            const dots = document.createElement('div');
            dots.className = 'dots';
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = SLOT_MAP[item.slot].color;
            dots.appendChild(dot);
            const entry = document.createElement('div');
            entry.className = 'entry';
            const snippet = document.createElement('div');
            snippet.className = 'snip';
            snippet.textContent = item.text;
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = `${SLOT_MAP[item.slot].label} · Found on ${item.sources.length} ${item.sources.length === 1 ? 'page' : 'pages'}`;
            const sources = document.createElement('div');
            sources.className = 'sources';
            for (const source of item.sources) {
                const link = document.createElement('a');
                link.className = 'source';
                link.href = source.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                let site = source.url;
                try { site = new URL(source.url).hostname; } catch (e) { /* preserve the saved URL */ }
                link.textContent = `${source.title || site} · ${site}`;
                link.title = source.url;
                sources.appendChild(link);
            }
            entry.append(snippet, meta, sources);
            row.append(dots, entry);
            row.addEventListener('click', event => {
                if (event.target.closest('a')) return;
                if (item.sources.some(source => source.url === location.href)) {
                    const target = [...registry.entries()].find(([, ent]) =>
                        ent.records.some(record => record.slot === item.slot &&
                            historyKey(record.slot, record.text) === item.key)
                    );
                    if (target) { jumpTo(target[0]); return; }
                }
                const firstSource = item.sources[0];
                if (firstSource && isWebUrl(firstSource.url)) window.open(firstSource.url, '_blank', 'noopener');
            });
            list.appendChild(row);
        }
    }

    function rgba(hex, a) {
        const v = hex.replace('#', '');
        return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
    }

    // WANT is drawn in four shades by level: lighter = exploring, darker = committed / specific.
    // [background alpha, underline thickness px]
    const WANT_SHADE = {
        explore:  [0.12, 1],
        desire:   [0.26, 2],
        goal:     [0.42, 3],
        specific: [0.60, 3]
    };
    function highlightName(slot, level) {
        return slot === 'want' ? 'want-' + (WANT_SHADE[level] ? level : 'desire') : slot;
    }

    function injectPageStyle() {
        const rule = (name, color, alpha, px) =>
            `::highlight(jh-${name}){background-color:${rgba(color, alpha)};text-decoration:underline;` +
            `text-decoration-color:${color};text-decoration-thickness:${px}px;text-underline-offset:2px;}`;
        const rules = [];
        for (const s of SLOTS) {
            if (s.id === 'want') {
                for (const [lvl, [a, px]] of Object.entries(WANT_SHADE)) rules.push(rule('want-' + lvl, s.color, a, px));
            } else {
                rules.push(rule(s.id, s.color, 0.28, 2));
            }
        }
        rules.push('::highlight(jh-flash){background-color:rgba(255,235,59,.6);}');
        const st = document.createElement('style');
        st.id = 'jh-style';
        st.textContent = rules.join('\n');
        (document.head || document.documentElement).appendChild(st);
    }

    function processBlock(block) {
        const { items, text } = textItems(block);
        const key = hash(text);
        const prev = registry.get(block);
        if (prev && prev.key === key && prev.records.every(r => !r.range.collapsed)) return false;

        const res = analyze(text);
        const records = [];
        for (const sp of res.spans) {
            const range = rangeFor(items, sp.start, sp.end);
            if (range) records.push({ slot: sp.slot, level: sp.level, text: sp.text, range });
        }
        registry.set(block, { key, records, slots: res.slots, text });
        return true;
    }

    function applyHighlights() {
        const per = {};
        SLOTS.forEach((s, i) => {
            const names = s.id === 'want' ? Object.keys(WANT_SHADE).map(l => 'want-' + l) : [s.id];
            for (const n of names) {
                const h = new Highlight();
                h.priority = i * 10 + (LEVEL_RANK[n.replace('want-', '')] || 0); // on overlap, the more committed shade wins
                per[n] = h;
            }
        });
        for (const [blk, ent] of registry) {
            if (!blk.isConnected) { registry.delete(blk); continue; }
            for (const r of ent.records) {
                if (enabled.has(r.slot)) per[highlightName(r.slot, r.level)].add(r.range);
            }
        }
        for (const n of Object.keys(per)) CSS.highlights.set('jh-' + n, per[n]);
    }

    /* ════════════════════════════════════════════════════════════════
       6. SCANNING (incremental; works with infinite scroll)
       ════════════════════════════════════════════════════════════════ */

    const tick = () => new Promise(r => setTimeout(r, 0));
    let timer = null, running = false, dirty = false;

    function schedule(delay) {
        clearTimeout(timer);
        timer = setTimeout(scan, delay == null ? 600 : delay);
    }

    async function scan() {
        if (running) { dirty = true; return; }
        running = true;
        try {
            const blocks = collectBlocks(document.body);
            for (let i = 0; i < blocks.length; i++) {
                processBlock(blocks[i]);
                if (i % 25 === 24) await tick(); // keep phones responsive
            }
            applyHighlights();
            await historyReady;
            await rememberHistory();
            renderUI();
        } catch (e) {
            console.warn('[journey] scan failed', e);
        } finally {
            running = false;
            if (dirty) { dirty = false; schedule(300); }
        }
    }

    /* ════════════════════════════════════════════════════════════════
       7. UI (shadow DOM; touch-first)
       ════════════════════════════════════════════════════════════════ */

    function buildUI() {
        host = document.createElement('div');
        host.id = 'jh-root';
        host.style.cssText = 'all:initial;position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483647;';
        shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
<style>
 *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
 .btn{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:46px;height:46px;border-radius:50%;
   background:#1a1a2e;border:2px solid #555;color:#fff;display:flex;align-items:center;justify-content:center;
   font:700 13px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.5);user-select:none;cursor:pointer}
 .btn.open{border-color:#fdd835}
 .panel{position:fixed;right:8px;bottom:calc(66px + env(safe-area-inset-bottom,0px));width:min(94vw,380px);max-height:62vh;
   display:none;flex-direction:column;background:#1a1a2e;color:#ddd;border:1px solid #444;border-radius:12px;
   box-shadow:0 6px 24px rgba(0,0,0,.6);font:13px/1.45 system-ui,sans-serif;overflow:hidden}
 .panel.open{display:flex}
 .hdr{padding:10px 12px 6px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#aaa}
 .tabs{display:flex;gap:6px;padding:2px 10px 8px}
 .tab{flex:1;padding:7px;border:1px solid #444;border-radius:8px;background:#23233a;color:#aaa;font:600 12px system-ui,sans-serif;cursor:pointer}
 .tab.active{border-color:#fdd835;color:#fff;background:#30304a}
 .chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 8px}
 .chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:14px;border:1px solid #444;
   font-size:12px;color:#ddd;background:#23233a;cursor:pointer;user-select:none}
 .chip.off{opacity:.35}
 .search{padding:0 10px 8px}
 .search input{width:100%;padding:8px 10px;border:1px solid #444;border-radius:8px;background:#23233a;color:#eee;font:12px system-ui,sans-serif;outline:none}
 .search input:focus{border-color:#7cb342}
 .history-tools{display:flex;justify-content:flex-end;padding:0 10px 8px}
 .clear-history{padding:6px 9px;border:1px solid #744;background:#3a2329;color:#f2b8b8;border-radius:7px;font:12px system-ui,sans-serif;cursor:pointer}
 .clear-history:disabled{opacity:.45;cursor:default}
 .dot{width:9px;height:9px;border-radius:50%;display:inline-block}
 .list{overflow-y:auto;border-top:1px solid #333;-webkit-overflow-scrolling:touch}
 .row{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;min-height:44px;border-bottom:1px solid #2a2a40;cursor:pointer}
 .row:active{background:#2a2a3e}
 .dots{display:flex;gap:3px;padding-top:5px;flex:none}
 .dots .dot{width:8px;height:8px}
 .entry{flex:1;min-width:0}
 .snip{color:#ccc;font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 .meta{margin-top:3px;color:#777;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .sources{display:flex;flex-direction:column;gap:3px;margin-top:5px}
 .source{color:#82b5df;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cov{flex:none;color:#888;font-size:11px;padding-top:2px}
 .empty{padding:14px;color:#888;font-size:12px}
 .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(74px + env(safe-area-inset-bottom,0px));max-width:90vw;
   background:#111;color:#eee;border:1px solid #444;border-radius:10px;padding:8px 12px;font:12px/1.4 system-ui,sans-serif;
   display:none;box-shadow:0 4px 16px rgba(0,0,0,.6)}
 .toast b{font-weight:700}
</style>
<div class="toast"></div>
<div class="panel">
  <div class="hdr"></div>
  <div class="tabs"><button class="tab active" data-tab="current">Current page</button><button class="tab" data-tab="history">History</button></div>
  <div class="chips"></div>
  <div class="search" hidden><input type="search" placeholder="Search past highlights…" aria-label="Search history" autocomplete="off"></div>
  <div class="history-tools" hidden><button class="clear-history" type="button">Clear history</button></div>
  <div class="list"></div>
</div>
<div class="btn" title="Journey signals">0</div>`;

        document.body.appendChild(host);

        const btn = shadow.querySelector('.btn');
        btn.addEventListener('click', () => {
            panelOpen = !panelOpen;
            btn.classList.toggle('open', panelOpen);
            shadow.querySelector('.panel').classList.toggle('open', panelOpen);
            renderUI();
        });
        shadow.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                currentTab = tab.dataset.tab;
                renderUI();
            });
        });
        shadow.querySelector('.search input').addEventListener('input', event => {
            historyQuery = event.target.value.trim().toLocaleLowerCase();
            renderHistory();
        });
        shadow.querySelector('.clear-history').addEventListener('click', clearHistory);
    }

    async function clearHistory() {
        if (!historyEntries.length || !window.confirm('Clear all saved highlighted phrases and their page links? This cannot be undone.')) return;
        try {
            await historyReady;
            if (typeof GM_setValue === 'function') await GM_setValue(HISTORY_KEY, []);
            else localStorage.removeItem(HISTORY_KEY);
        } catch (e) {
            console.warn('[journey] could not clear history', e);
            window.alert('History could not be cleared because browser storage is unavailable.');
            return;
        }
        historyEntries.length = 0;
        historyIndex.clear();
        renderUI();
    }

    function docOrder(a, b) {
        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    }

    function renderUI() {
        if (!shadow) return;

        const entries = [];
        const counts = Object.fromEntries(SLOTS.map(s => [s.id, 0]));
        for (const [blk, ent] of registry) {
            if (!blk.isConnected) continue;
            const present = ent.slots.filter(id => enabled.has(id));
            ent.slots.forEach(id => { counts[id]++; });
            if (present.length) entries.push({ el: blk, ent, present });
        }

        shadow.querySelector('.btn').textContent = entries.length;
        if (!panelOpen) return;

        shadow.querySelectorAll('.tab').forEach(tab => {
            const active = tab.dataset.tab === currentTab;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        shadow.querySelector('.search').hidden = currentTab !== 'history';
        shadow.querySelector('.history-tools').hidden = currentTab !== 'history';

        const chips = shadow.querySelector('.chips');
        chips.innerHTML = '';
        if (currentTab === 'history') {
            const counts = Object.fromEntries(SLOTS.map(s => [s.id, 0]));
            for (const item of historyEntries) {
                if (counts[item.slot] !== undefined) counts[item.slot]++;
            }
            shadow.querySelector('.hdr').textContent = `History · ${historyEntries.length} highlights`;
            shadow.querySelector('.clear-history').disabled = historyEntries.length === 0;
            for (const s of SLOTS) {
                const c = document.createElement('button');
                c.className = 'chip' + (historyEnabled.has(s.id) ? '' : ' off');
                c.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.label} ${counts[s.id]}`;
                c.addEventListener('click', () => {
                    if (historyEnabled.has(s.id)) historyEnabled.delete(s.id);
                    else historyEnabled.add(s.id);
                    renderUI();
                });
                chips.appendChild(c);
            }
            renderHistory();
            return;
        }

        shadow.querySelector('.hdr').textContent = `Journey signals · ${entries.length} blocks`;
        for (const s of SLOTS) {
            const c = document.createElement('div');
            c.className = 'chip' + (enabled.has(s.id) ? '' : ' off');
            c.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.label} ${counts[s.id]}`;
            c.addEventListener('click', () => {
                if (enabled.has(s.id)) enabled.delete(s.id); else enabled.add(s.id);
                saveEnabled();
                applyHighlights();
                renderUI();
            });
            chips.appendChild(c);
        }

        // Rank by slot coverage (replaces the old score): rich journeys float to the top.
        entries.sort((a, b) => (b.present.length - a.present.length) || docOrder(a, b));

        const list = shadow.querySelector('.list');
        list.innerHTML = '';
        shadow.querySelector('.search').hidden = true;
        if (!entries.length) {
            list.innerHTML = '<div class="empty">No journey signals found on this page yet.</div>';
            return;
        }
        for (const e of entries.slice(0, 80)) {
            const row = document.createElement('div');
            row.className = 'row';
            const dots = e.present.map(id => `<span class="dot" style="background:${SLOT_MAP[id].color}"></span>`).join('');
            const snippet = e.ent.text.replace(/\s+/g, ' ').trim().slice(0, 140);
            row.innerHTML = `<div class="dots">${dots}</div><div class="snip"></div><div class="cov">${e.present.length}/${SLOTS.length}</div>`;
            row.querySelector('.snip').textContent = snippet;
            row.addEventListener('click', () => jumpTo(e.el));
            list.appendChild(row);
        }
    }

    function jumpTo(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
            const r = document.createRange();
            r.selectNodeContents(el);
            const h = new Highlight(r);
            h.priority = 100;
            CSS.highlights.set('jh-flash', h);
            setTimeout(() => CSS.highlights.delete('jh-flash'), 1800);
        } catch (e) { /* ignore */ }
        panelOpen = false;
        shadow.querySelector('.btn').classList.remove('open');
        shadow.querySelector('.panel').classList.remove('open');
    }

    // Tap a highlight → say which slot (touch replacement for hover tooltips)
    let toastTimer = null;
    function showToast(hits) {
        const t = shadow.querySelector('.toast');
        t.innerHTML = '';
        for (const h of hits.slice(0, 3)) {
            const s = SLOT_MAP[h.slot];
            const d = document.createElement('div');
            const lvl = h.level ? ` · ${LEVEL_LABEL[h.level]}` : '';
            d.innerHTML = `<span class="dot" style="background:${s.color}"></span> <b>${s.label}</b>${lvl}`;
            t.appendChild(d);
        }
        t.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2500);
    }

    function caretFromPoint(x, y) {
        if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            return p ? { node: p.offsetNode, offset: p.offset } : null;
        }
        if (document.caretRangeFromPoint) {
            const r = document.caretRangeFromPoint(x, y);
            return r ? { node: r.startContainer, offset: r.startOffset } : null;
        }
        return null;
    }

    function onTap(e) {
        if (!host || e.composedPath().includes(host)) return;
        const pos = caretFromPoint(e.clientX, e.clientY);
        if (!pos || !pos.node) return;
        const hits = [];
        for (const [blk, ent] of registry) {
            if (!blk.contains(pos.node)) continue;
            for (const r of ent.records) {
                if (!enabled.has(r.slot)) continue;
                try { if (r.range.isPointInRange(pos.node, pos.offset)) hits.push(r); } catch (err) { /* detached */ }
            }
            break;
        }
        if (hits.length) showToast(hits);
    }

    /* ════════════════════════════════════════════════════════════════
       8. BOOT
       ════════════════════════════════════════════════════════════════ */

    function boot() {
        if (!HAS_HL) {
            const n = document.createElement('div');
            n.textContent = 'Journey highlighter: this browser lacks the CSS Custom Highlight API.';
            n.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#b71c1c;color:#fff;' +
                              'font:12px system-ui;padding:8px 10px;border-radius:8px';
            document.body.appendChild(n);
            setTimeout(() => n.remove(), 5000);
            return;
        }
        injectPageStyle();
        buildUI();
        document.addEventListener('click', onTap, true);

        new MutationObserver(muts => {
            for (const m of muts) {
                if (host && host.contains(m.target)) continue;
                schedule(700);
                break;
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });

        schedule(800);
    }

    boot();
})();
