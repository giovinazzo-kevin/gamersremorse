// ============================================================
// CONTROVERSY CONTEXT
// Fetch Google AI Overview for detected events
// ============================================================

const Controversy = (function() {
    let cachedHtml = null;
    
    function getCachedHtml() {
        return cachedHtml;
    }
    
    function clearCache() {
        cachedHtml = null;
    }

    async function fetchContext(gameName, metrics, snapshot) {
        const events = detectNotableEvents(metrics, snapshot);
        
        // Show status in the controversy section
        const container = document.getElementById('metrics-detail');
        if (container) {
            container.innerHTML += `
                <div class="controversy-section" id="controversy-loading">
                    <h4>🔍 What Happened?</h4>
                    <div class="controversy-item">
                        <div class="controversy-text">⏳ Searching for context...</div>
                    </div>
                </div>
            `;
        }
        
        // Fetch context for events + launch (limit to 4 total)
        const allEvents = events.slice(0, 4);
        const months = allEvents.map(e => e.month).join(',');
        const types = allEvents.map(e => e.type).join(',');
        const res = await fetch(`/controversies?game=${encodeURIComponent(gameName)}&months=${months}&types=${types}`);
        const data = await res.json();
        const contexts = data
            .filter(d => d.overview)
            .map(d => ({
                event: allEvents.find(e => e.month === d.month) || { type: 'unknown', month: d.month, year: d.month.split('-')[0] },
                overview: d.overview
            }));
        
        // Remove loading indicator
        document.getElementById('controversy-loading')?.remove();
        
        if (contexts.length > 0) {
            displayContext(contexts);
        }
    }

    function detectNotableEvents(metrics, snapshot) {
        const events = [];
        const tags = metrics.verdict.tags.map(t => t.id);

        // Launch is always notable
        let launchWasNegative = false;

        // Get first 3 months of data to determine launch sentiment (typed array format)
        const sortedMonths = snapshot.months || [];
        const monthlyTotals = snapshot.monthlyTotals;
        const launchMonthCount = Math.min(3, sortedMonths.length);

        if (launchMonthCount > 0 && monthlyTotals) {
            let launchPos = 0, launchNeg = 0;
            for (let i = 0; i < launchMonthCount; i++) {
                launchPos += (monthlyTotals.pos[i] || 0) + (monthlyTotals.uncPos[i] || 0);
                launchNeg += (monthlyTotals.neg[i] || 0) + (monthlyTotals.uncNeg[i] || 0);
            }
            launchWasNegative = launchNeg > launchPos;
        }

        events.push({
            type: launchWasNegative ? (tags.includes('FLOP') ? 'launch_flop' : 'launch_troubled') : 'launch',
            month: sortedMonths[0],
            year: sortedMonths[0] || '',
            severity: 0,
            tag: launchWasNegative ? (tags.includes('FLOP') ? 'FLOP' : 'LAUNCH') : 'LAUNCH'
        });

        // Review bombs
        if (tags.includes('REVIEW_BOMBED') && metrics.negativeSpikes) {
            for (const spike of metrics.negativeSpikes) {
                const hasVolume = spike.isVolumeSpike && spike.count >= 50;
                const hasSentiment = spike.isSentimentSpike && spike.sentimentZ >= 2;
                if (hasVolume || hasSentiment) {
                    const year = spike.month.split('-')[0];
                    const severity = Math.max(spike.volumeZ || 0, spike.sentimentZ || 0);
                    events.push({
                        type: 'review_bomb',
                        year,
                        month: spike.month,
                        severity,
                        count: spike.count,
                        tag: 'REVIEW_BOMBED'
                    });
                }
            }
        }

        // DEAD GAME
        if (tags.includes('DEAD') || tags.includes('ZOMBIE') || tags.includes('PRESS_F') || tags.includes('RUGPULL') || tags.includes('CURSED') || tags.includes('HOPELESS')) {
            // Find when activity dropped off
            const activityData = Metrics.getMonthlyActivityData(snapshot.bucketsByReviewTime, null);
            const activity = activityData.activity;

            if (activity.length >= 6) {
                // Find last month before activity dropped to <20% of first half average
                const firstHalfCount = Math.floor(activity.length / 2);
                const firstHalf = activity.slice(0, firstHalfCount);
                const avgActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
                const threshold = avgActivity * 0.2;

                // Walk backwards to find last "alive" month
                let deathMonth = null;
                for (let i = activity.length - 1; i >= 0; i--) {
                    if (activity[i].count >= threshold) {
                        deathMonth = activity[i].month;
                        break;
                    }
                }

                if (deathMonth) {
                    const year = deathMonth.split('-')[0];
                    events.push({
                        type: 'death',
                        year,
                        month: deathMonth,
                        severity: 2,
                        tag: tags.find(t => ['DEAD', 'ZOMBIE', 'PRESS_F', 'RUGPULL', 'CURSED', 'HOPELESS'].includes(t))
                    });
                }
            }
        }

        // Mass edit events
        if (tags.includes('RETCONNED') || tags.includes('ENSHITTIFIED')) {
            const editHeatmap = snapshot.editHeatmap;
            if (editHeatmap?.months?.length > 0) {
                // Count edits by month (when edited, not when posted)
                const editsByMonth = {};
                for (const [key, cell] of Object.entries(editHeatmap.cells || {})) {
                    const [posted, edited] = key.split('|');
                    if (edited !== posted) {
                        editsByMonth[edited] = (editsByMonth[edited] || 0) + cell.positive + cell.negative;
                    }
                }

                const editMonths = Object.keys(editsByMonth).sort();
                if (editMonths.length > 0) {
                    // Find largest contiguous period above threshold
                    const avgEdits = Object.values(editsByMonth).reduce((a, b) => a + b, 0) / editMonths.length;
                    const threshold = avgEdits * 0.5;

                    let bestStart = null, bestEnd = null, bestSum = 0;
                    let currStart = null, currSum = 0;

                    for (let i = 0; i < editMonths.length; i++) {
                        const month = editMonths[i];
                        const count = editsByMonth[month];

                        if (count >= threshold) {
                            if (currStart === null) currStart = month;
                            currSum += count;

                            const nextMonth = editMonths[i + 1];
                            const isContiguous = nextMonth && isNextMonth(month, nextMonth);

                            if (!isContiguous || i === editMonths.length - 1) {
                                if (currSum > bestSum) {
                                    bestStart = currStart;
                                    bestEnd = month;
                                    bestSum = currSum;
                                }
                                currStart = null;
                                currSum = 0;
                            }
                        } else {
                            if (currSum > bestSum) {
                                bestStart = currStart;
                                bestEnd = editMonths[i - 1];
                                bestSum = currSum;
                            }
                            currStart = null;
                            currSum = 0;
                        }
                    }
                    if (bestStart && bestEnd) {
                        const periodStr = bestStart === bestEnd
                            ? bestStart
                            : `${bestStart} to ${bestEnd}`;
                        events.push({
                            type: 'mass_edits',
                            year: periodStr,
                            month: periodStr,
                            severity: metrics.recentNegativeEditRatio,
                            tag: tags.includes('RETCONNED') ? 'RETCONNED' : 'ENSHITTIFIED'
                        });
                    }
                }
            }
        }

        // Dedupe by year - only keep most severe event per year
        const byYear = {};
        for (const event of events) {
            if (!byYear[event.year] || event.severity > byYear[event.year].severity) {
                byYear[event.year] = event;
            }
        }

        return Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
    }

    function isNextMonth(m1, m2) {
        const [y1, mo1] = m1.split('-').map(Number);
        const [y2, mo2] = m2.split('-').map(Number);
        if (mo1 === 12) {
            return y2 === y1 + 1 && mo2 === 1;
        }
        return y2 === y1 && mo2 === mo1 + 1;
    }

    function displayContext(contexts) {
        const container = document.getElementById('metrics-detail');
        if (!container) return;

        let html = '<div class="controversy-section">';
        html += '<h4>🔍 What Happened?</h4>';

        for (const ctx of contexts) {
            const tag = ctx.event.tag;
            const tagClass = tag ? tag.toLowerCase().replace(/_/g, '-') : 'launch';
            const yearLabel = ctx.event.year;

            html += `
                <details class="controversy-item">
                    <summary>
                        <span class="tag-pill" style="background: var(--color-tag-${tagClass})">${tag || 'LAUNCH'}</span>
                        <span class="controversy-year">${yearLabel}</span>
                    </summary>
                    <div class="controversy-text">${ctx.overview}</div>
                </details>
            `;
        }

        html += '</div>';
        container.innerHTML += html;
        cachedHtml = html;
    }

    return {
        fetchContext,
        getCachedHtml,
        clearCache
    };
})();
