// Opinion Panel Module
// Renders the human-readable verdict and advice

const Opinion = (function() {
    let deps = {
        isStreaming: () => true,
        getConvergenceScore: () => 0,
        getSnapshot: () => null
    };

    function init(dependencies) {
        deps = { ...deps, ...dependencies };
    }

    function update(metrics) {
        const el = document.getElementById('opinion-content');
        if (!el || !metrics) return;

        const isStreaming = deps.isStreaming();
        const convergenceScore = deps.getConvergenceScore();
        const currentSnapshot = deps.getSnapshot();

        // Don't render verdict until converged
        if (isStreaming && convergenceScore < 0.8) {
            const sampled = currentSnapshot.totalPositive + currentSnapshot.totalNegative;
            const target = currentSnapshot.targetSampleCount;
            const pct = Math.round(convergenceScore * 100);
            const progressPct = target > 0 ? Math.round((sampled / target) * 100) : 0;
            el.innerHTML = `
                <div class="opinion-converging">
                    <div class="opinion-verdict caution">? Analysis in progress...</div>
                    <p>The data is still converging. Early patterns are forming but the verdict isn't stable yet.</p>
                    <p><strong>Progress:</strong> ${sampled.toLocaleString()} / ${target.toLocaleString()} reviews (${progressPct}%)</p>
                    <p><strong>Confidence:</strong> ${pct}%${pct == 69 ? " (nice)" : ""}</p>
                    <p class="opinion-hint">Once the tags settle, we'll have something to say.</p>
                </div>
            `;
            return;
        }

        const tags = metrics.verdict.tags.map(t => t.id);
        const posMedianHours = Math.round(metrics.posMedianReview / 60);
        const negMedianHours = Math.round(metrics.negMedianReview / 60);
        const positivePct = Math.round(metrics.positiveRatio * 100);
        const negativePct = Math.round(metrics.negativeRatio * 100);

        // Determine overall verdict class and message
        let verdictClass = 'caution';
        let verdictText = 'Proceed with awareness';
        let verdictExplain = '';

        if (tags.includes('PREDATORY') || tags.includes('REFUND_TRAP')) {
            verdictClass = 'warning';
            verdictText = 'High risk of regret';
            verdictExplain = `This game shows patterns associated with buyer's remorse. ${negativePct}% of reviews are negative, and they come after significant time investment.`;
        } else if (tags.includes('EXTRACTIVE') || tags.includes('STOCKHOLM')) {
            verdictClass = 'warning';
            verdictText = 'Time extraction detected';
            verdictExplain = `People who dislike this game figure it out at ${negMedianHours}h—after those who like it (${posMedianHours}h). The game takes before it reveals.`;
        } else if (tags.includes('HEALTHY') || tags.includes('HONEST')) {
            verdictClass = 'healthy';
            verdictText = 'Respects your time';
            verdictExplain = `${positivePct}% positive. People who won't like it figure that out by ${negMedianHours}h. The game is honest about what it is.`;
        } else if (tags.includes('FLOP')) {
            verdictClass = 'warning';
            verdictText = 'Most people bounce';
            verdictExplain = `${negativePct}% negative reviews, and they knew fast (${negMedianHours}h median). This might not be for you either.`;
        } else if (tags.includes('DIVISIVE')) {
            verdictClass = 'caution';
            verdictText = 'Love it or hate it';
            verdictExplain = `Near 50/50 split. Some people adore this, others don't. Worth researching if it's your kind of thing.`;
        } else if (tags.includes('REDEMPTION') || tags.includes('180') || tags.includes('PHOENIX')) {
            verdictClass = 'healthy';
            verdictText = 'Redemption arc';
            verdictExplain = `This game improved over time. Earlier reviews may not reflect current state. Recent sentiment is more positive.`;
        } else if (tags.includes('ENSHITTIFIED') || tags.includes('HONEYMOON')) {
            verdictClass = 'caution';
            verdictText = 'Getting worse';
            verdictExplain = `Sentiment has declined over time. What you read in old reviews may not match current experience.`;
        }

        // Build the time commitment section
        let timeCommitment = '';
        if (negMedianHours < 10) {
            timeCommitment = `<strong>Quick read:</strong> You'll know if it's for you within ${negMedianHours} hours.`;
        } else if (negMedianHours < 50) {
            timeCommitment = `<strong>Medium investment:</strong> Expect to put in ${negMedianHours}+ hours before you really know.`;
        } else if (negMedianHours < 200) {
            timeCommitment = `<strong>Significant commitment:</strong> People who dislike it played ${negMedianHours} hours first. That's a lot of time to risk.`;
        } else {
            timeCommitment = `<strong>Lifestyle game:</strong> ${negMedianHours} hours before people decided they didn't like it. This isn't a game, it's a relationship.`;
        }

        // Stockholm warning
        let stockholmWarning = '';
        if (metrics.stockholmIndex > 1.5 && negMedianHours > 100) {
            const extraHours = Math.round((metrics.negMedianTotal - metrics.negMedianReview) / 60);
            stockholmWarning = `
                <div class="opinion-tldr" style="border-left-color: var(--color-negative);">
                    <strong>Stockholm alert:</strong> People who left negative reviews played ${extraHours} MORE hours after saying they hated it. 
                    The game is designed to keep you playing even when you're not having fun.
                </div>
            `;
        }

        el.innerHTML = `
            <div class="opinion-verdict ${verdictClass}">${verdictText}</div>
            <p>${verdictExplain}</p>
            <p>${timeCommitment}</p>
            ${stockholmWarning}
            <div class="opinion-tldr">
                <strong>TL;DR:</strong> 
                ${positivePct}% positive at ${posMedianHours}h, 
                ${negativePct}% negative at ${negMedianHours}h.
                ${metrics.medianRatio > 1.3 ? 'Red flag: negatives take longer to form.' :
                metrics.medianRatio < 0.7 ? 'Good sign: negatives bounce early.' :
                    'Neutral: similar time to verdict either way.'}
            </div>
        `;
    }

    return {
        init,
        update
    };
})();
