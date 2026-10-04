const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
};
export const PROPOSALS = {
    'Stardust: two-player co-op prototype': {
        title: 'Fly together', project: 'Stardust co-op',
        summary: 'One small challenge. Two pilots. A shared finish.',
        deliverables: ['Join a local/LAN room', 'Win or fail together', 'Retry the shared challenge'],
        image: 'assets/images/stardust/alpha-relay-flight.webp', visual: 'Current Stardust flight · co-op proposed', art: 'coop',
    },
    'Kingdoms & Caravans: refreshed playable build': {
        title: 'Bring the city forward', project: 'Kingdoms & Caravans',
        summary: 'A refreshed, tested Windows playtest.',
        deliverables: ['Review the existing city loop', 'Fix the biggest blockers', 'Package a clean-launch build'],
        image: 'assets/kingdoms-caravans/city.png', visual: 'Current gameplay · proposed build refresh', art: 'city',
    },
    'Stardust: build and share your ship': {
        title: 'Make it your ship', project: 'Stardust ship builder',
        summary: 'Polish the existing parts-and-colours builder.',
        deliverables: ['Choose parts and colours', 'Save and equip your design', 'Show it on your profile'],
        image: 'assets/voting/ship.png', visual: 'Existing Stardust ship art · builder polish proposed', art: 'ship',
    },
};
export function remainingTime(poll, elapsedMs = 0) {
    if (poll.state !== 'OPEN' || !poll.closesAt || !poll.serverTime) return null;
    return Math.max(0, Date.parse(poll.closesAt) - Date.parse(poll.serverTime) - elapsedMs);
}
export function timeLabel(poll, elapsedMs = 0) {
    if (poll.state === 'DRAFT') return 'Draft · clock not started';
    if (poll.state === 'CLOSED') return 'Voting closed';
    const remaining = remainingTime(poll, elapsedMs);
    if (remaining === null) return 'Closing time not set';
    if (!remaining) return 'Voting time ended';
    const seconds = Math.ceil(remaining / 1000), days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
    return `${days ? `${days}d ` : ''}${hours}h ${String(minutes).padStart(2,'0')}m ${String(seconds % 60).padStart(2,'0')}s left`;
}
export function votePercentage(votes, total) {
    return total ? `${Number((votes * 100 / total).toFixed(1))}%` : '0%';
}
export function createPollCarousel(poll, { signedIn, accountUrl, state, submit, expired, report, base = '/' }) {
    const card = element('article', undefined, 'poll-carousel noir-card noir-card--lit'); card.dataset.pollId = poll.id;
    card.setAttribute('role','region'); card.setAttribute('aria-roledescription','carousel'); card.setAttribute('aria-label',poll.title); card.tabIndex=0;
    const header=element('header',undefined,'poll-heading');
    const title=element('h3',poll.title); title.id=`poll-${poll.id}`;
    const timer=element('span',timeLabel(poll),'poll-timer'); timer.setAttribute('role','timer'); timer.setAttribute('aria-live','off');
    if(poll.closesAt) timer.title=`Closes ${new Date(poll.closesAt).toLocaleString()}`;
    header.append(title,timer); card.append(header);
    const viewport=element('div',undefined,'poll-viewport'); const slides=[];
    for(const [index, option] of poll.options.entries()) {
        const proposal=PROPOSALS[option.label] || {title:option.label,project:'Development proposal',summary:'',deliverables:[],image:'assets/images/stardust/alpha-relay-flight.webp',visual:'Illustration · existing project art'};
        const slide=element('section',undefined,`poll-slide poll-proposal poll-theme-${proposal.art||'generic'}`);
        slide.setAttribute('role','group'); slide.setAttribute('aria-roledescription','slide'); slide.setAttribute('aria-label',`Proposal ${index+1}: ${option.label}`);
        const copy=element('div',undefined,'poll-proposal-copy');
        copy.append(element('p',`${String(index+1).padStart(2,'0')} / ${proposal.project}`,'poll-project'),element('h4',proposal.title),element('p',proposal.summary,'poll-summary'));
        const list=element('ul',undefined,'poll-deliverables'); for(const item of proposal.deliverables)list.append(element('li',item));copy.append(list);
        const media=element('figure',undefined,'poll-media');
        const image=element('img',undefined,'poll-background'); image.src=base+proposal.image; image.alt=''; image.loading=index?'lazy':'eager';media.append(image,element('figcaption',proposal.visual,'poll-visual-note'));
        slide.append(copy,media); slides.push(slide); viewport.append(slide);
    }
    const final=element('section',undefined,'poll-slide poll-ballot'); final.setAttribute('role','group');final.setAttribute('aria-roledescription','slide');final.setAttribute('aria-label','Vote and results');
    const heading=element('div',undefined,'poll-ballot-heading'); heading.append(element('p','04 / Community ballot','poll-project'),element('h4',poll.ownVote?'Your vote is in':poll.state==='CLOSED'?'Final totals':'Make the call.'),element('span','One vote','poll-one-vote')); final.append(heading);
    const form=element('form'); const field=element('fieldset'); const legend=element('legend','Development priority','sr-only'); field.append(legend);
    const canVote=poll.state==='OPEN' && signedIn && !poll.ownVote;
    for(const [index,option] of poll.options.entries()) {
        const proposal=PROPOSALS[option.label];
        const label=element('label',undefined,`poll-result-row poll-choice-${proposal?.art||'generic'}`);
        const input=element('input');input.type='radio';input.name='optionId';input.value=option.id;input.required=true;input.disabled=!canVote;input.checked=(poll.ownVote||state.selected)===option.id;
        input.addEventListener('change',()=>{state.selected=option.id;});
        const copy=element('span',undefined,'poll-option-copy');
        const thumb=element('img',undefined,'poll-option-image');thumb.src=base+(proposal?.image||'assets/images/stardust/alpha-relay-flight.webp');thumb.alt='';thumb.loading='lazy';
        const text=element('span',proposal?.title||option.label,'poll-option-name');
        copy.append(element('span',`${String(index+1).padStart(2,'0')} / ${proposal?.project||'Proposal'}`,'poll-option-project'),text);
        const count=element('span',undefined,'poll-count');count.append(element('strong',votePercentage(option.votes,poll.totalVotes),'poll-percentage'),element('span',`${option.votes} ${option.votes===1?'vote':'votes'}`,'poll-vote-count'));
        const bar=element('span',undefined,'poll-bar'); const fill=element('span',undefined,'poll-bar-fill');fill.style.width='0%';requestAnimationFrame(()=>{fill.style.width=`${poll.totalVotes?option.votes*100/poll.totalVotes:0}%`;});bar.append(fill);bar.setAttribute('aria-hidden','true');
        label.append(input,thumb,copy,count,bar); if(poll.ownVote===option.id)label.append(element('span','Your vote','poll-own-vote'));field.append(label);
    }
    const message=element('p',undefined,'poll-feedback');message.setAttribute('role','status');message.tabIndex=-1;
    const refresh=element('button','↻','poll-refresh');refresh.type='button';refresh.setAttribute('aria-label','Refresh totals');
    refresh.addEventListener('click',async()=>{refresh.disabled=true;try{await expired();}catch{message.textContent='Could not refresh totals. Try again.';}finally{refresh.disabled=false;}});heading.append(refresh);
    const button=element('button','Vote →','poll-vote-button');button.type='submit';button.setAttribute('aria-label','Vote');
    form.append(field,element('p',`${poll.totalVotes} ${poll.totalVotes===1?'vote':'votes'} total`,'poll-total'),message);
    if(canVote)form.append(button);
    else if(!signedIn){const signIn=element('a',poll.state==='OPEN'?'Sign in to vote':'Sign in','poll-vote-button');signIn.href=accountUrl;form.append(signIn);}
    else if(poll.state==='CLOSED')form.append(element('p','Closed','poll-closed'));
    final.append(form);slides.push(final);viewport.append(final);card.append(viewport);
    const controls=element('div',undefined,'poll-controls');
    const previous=element('button','←','poll-arrow');previous.type='button';previous.setAttribute('aria-label','Previous slide');
    const next=element('button','→','poll-arrow');next.type='button';next.setAttribute('aria-label','Next slide');
    const indicators=element('div',undefined,'poll-indicators');const dots=[];
    const announcement=element('span',undefined,'sr-only');announcement.setAttribute('aria-live','polite');
    function show(index,announce=true){state.index=Math.max(0,Math.min(slides.length-1,index));slides.forEach((slide,i)=>{slide.hidden=i!==state.index;slide.inert=i!==state.index;});dots.forEach((dot,i)=>{dot.setAttribute('aria-current',i===state.index?'step':'false');});previous.disabled=state.index===0;next.disabled=state.index===slides.length-1;if(announce)announcement.textContent=`${state.index+1} of ${slides.length}: ${slides[state.index].getAttribute('aria-label')}`;}
    slides.forEach((slide,index)=>{const dot=element('button',String(index+1));dot.type='button';dot.setAttribute('aria-label',slide.getAttribute('aria-label'));dot.addEventListener('click',()=>show(index));dots.push(dot);indicators.append(dot);});
    previous.addEventListener('click',()=>show(state.index-1));next.addEventListener('click',()=>show(state.index+1));controls.append(previous,indicators,next,announcement);card.append(controls);show(state.index||0,false);
    card.addEventListener('keydown',event=>{if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;const move={ArrowLeft:state.index-1,ArrowRight:state.index+1,Home:0,End:slides.length-1}[event.key];if(move!==undefined){event.preventDefault();show(move);}});
    let touch;
    viewport.addEventListener('pointerdown',event=>{if(event.pointerType==='touch' && !event.target.closest('form,button,a'))touch={x:event.clientX,y:event.clientY};});
    viewport.addEventListener('pointerup',event=>{if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.5)show(state.index+(dx<0?1:-1));});
    viewport.addEventListener('pointercancel',()=>{touch=null;});
    form.addEventListener('submit',async event=>{
        event.preventDefault();if(!canVote || button.disabled || !form.reportValidity())return;
        const optionId=new FormData(form).get('optionId'),option=poll.options.find(o=>o.id===optionId);
        if(!window.confirm(`Vote for "${PROPOSALS[option.label]?.title||option.label}"? This is your final vote for this poll.`))return;
        button.disabled=true;field.disabled=true;message.textContent='Saving…';
        try{await submit(optionId);report('Your vote is recorded.');}
        catch(error){message.textContent=error.message;if(error.status===401 || error.code==='EMAIL_VERIFICATION_REQUIRED'){const link=element('a',error.status===401?' Sign in':' Confirm email');link.href=accountUrl;message.append(link);}message.focus();if(error.code==='POLL_CLOSED')expired().catch(()=>{});else{button.disabled=false;field.disabled=false;}}
    });
    const received=performance.now();let checked=false;
    const tick=()=>{const elapsed=performance.now()-received;timer.textContent=timeLabel(poll,elapsed);if(poll.state==='OPEN' && remainingTime(poll,elapsed)===0 && !checked){checked=true;button.disabled=true;field.disabled=true;message.textContent='Voting time ended. Checking final totals…';expired().catch(()=>{message.textContent='Voting time ended. Refresh for final totals.';});}};
    const interval=poll.closesAt&&poll.state==='OPEN'?setInterval(tick,1000):null;card.dispose=()=>{if(interval)clearInterval(interval);};tick();
    return card;
}
