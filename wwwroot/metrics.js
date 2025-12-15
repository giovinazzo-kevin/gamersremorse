/**
 * Metrics module for gamersremorse
 * Pure analysis functions - no UI, no side effects
 * 
 * Two types of metrics:
 * 1. RATIO-BASED: Comparing two groups (positive vs negative). Thresholds are intuitive percentages.
 * 2. STDDEV-BASED: Detecting unusual patterns within a distribution. Thresholds are statistical.
 */

const Metrics = {
    hierarchies: {
        // Key beats Values
        'PREDATORY': ['EXTRACTIVE'],
        'EXTRACTIVE': ['TROUBLED'],
        'TROUBLED': ['HONEST'],
    },
    tagDefinitions: [
        // ============================================================
        // RATIO-BASED TAGS
        // Comparing positive vs negative groups
        // Thresholds are intuitive: 1.3x = "30% more", 0.7x = "30% less"
        // ============================================================
        
        {
            id: 'HEALTHY',
            // 80%+ positive AND negatives don't take significantly longer
            condition: (m) => m.positiveRatio > 0.80 && m.medianRatio < 1.3,
            reason: (m) => `${Math.round(m.positiveRatio * 100)}% positive reviews`,
            severity: -0.2,
            color: '#2ecc71'
        },
        {
            id: 'HONEST',
            // Negatives leave 30%+ earlier than positives - game shows its true colors fast
            condition: (m) => m.medianRatio < 0.7 && m.negativeRatio > 0.05,
            reason: (m) => `Negatives out at ${Math.round(m.negMedianReview / 60)}h vs positives at ${Math.round(m.posMedianReview / 60)}h (${Math.round((1 - m.medianRatio) * 100)}% earlier)`,
            severity: -0.15,
            color: '#27ae60'
        },
        {
            id: 'EXTRACTIVE',
            // Significant mass of negatives at high playtime
            // Not just outliers - actual pattern of people getting trapped
            condition: (m) => m.medianRatio > 1.3 
                && m.negativeRatio > 0.20  // At least 20% negative overall
                && m.temporalDriftZ <= 1,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at ${Math.round(m.negMedianReview / 60)}h (${Math.round((m.medianRatio - 1) * 100)}% longer than positives)`,
            severity: (m) => Math.min(0.3, (m.medianRatio - 1) * 0.3),
            color: 'var(--color-tag-extractive)'
        },
        {
            id: 'ENSHITTIFIED',
            // Game got worse: sentiment declined AND now shows extraction pattern
            // The extraction pattern is ACQUIRED, not designed
            condition: (m) => m.medianRatio > 1.3 
                && m.negativeRatio > 0.20
                && m.temporalDriftZ > 1,
            reason: (m) => `Was good, got ruined: sentiment ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative, ${Math.round(m.negativeRatio * 100)}% now trapped`,
            severity: (m) => Math.min(0.35, (m.medianRatio - 1) * 0.3 + m.temporalDriftZ * 0.05),
            color: '#8B4513'
        },
        {
            id: 'PREDATORY',
            // Extractive (50%+ longer) AND lots of people affected (30%+ negative)
            condition: (m) => m.medianRatio > 1.5 && m.negativeRatio > 0.30,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative after ${Math.round(m.negMedianReview / 60)}h median (${Math.round((m.medianRatio - 1) * 100)}% longer than positive)`,
            severity: 0.25,
            color: 'var(--color-tag-predatory)'
        },
        {
            id: 'STOCKHOLM',
            // Confirmed haters played 50%+ more AFTER leaving negative review
            // AND they already had 200h+ invested
            condition: (m) => {
                const certainNegRatio = m.counts.negative / Math.max(1, m.counts.negative + m.counts.uncertainNegative);
                return m.stockholmIndex > 1.5 
                    && m.negMedianReview > 200 * 60 
                    && certainNegRatio > 0.5;
            },
            reason: (m) => `Haters: ${Math.round(m.negMedianReview / 60)}h at review → ${Math.round(m.negMedianTotal / 60)}h total (${Math.round((m.stockholmIndex - 1) * 100)}% more after hating it)`,
            severity: (m) => Math.min(0.25, (m.stockholmIndex - 1) * 0.2),
            color: '#9b59b6'
        },
        {
            id: 'DIVISIVE',
            // Close to 50/50 split (35-50% negative) AND people actually played it (20h+)
            condition: (m) => m.negativeRatio > 0.35 && m.negativeRatio < 0.50 && m.posMedianReview > 20 * 60,
            reason: (m) => `${Math.round(m.positiveRatio * 100)}/${Math.round(m.negativeRatio * 100)} split`,
            severity: 0.05,
            color: '#9932CC'
        },
        {
            id: 'FLOP',
            // Majority negative (50%+) AND negatives knew fast (30%+ earlier than positives)
            condition: (m) => m.negativeRatio > 0.50 && m.medianRatio < 0.7,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at only ${Math.round(m.negMedianReview / 60)}h median`,
            severity: 0.2,
            color: '#8B0000'
        },
        {
            id: 'TROUBLED',
            condition: (m) => m.negativeRatio > 0.35 && m.medianRatio <= 1.0 && m.positiveRatio < 0.80,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at ${Math.round(m.negMedianReview / 60)}h`,
            severity: 0.1,
            color: '#a08060'
        },
        {
            id: 'REFUND_TRAP',
            // Positives review early, but negatives don't
            // At least 20% of positives before 2h, but less than 10% of negatives
            condition: (m) => m.refundPosRate !== null && m.refundPosRate >= 0.20 && m.refundNegRate < 0.10 && m.negativeRatio > 0.15,
            reason: (m) => `${Math.round(m.refundPosRate * 100)}% of positives before 2h, but only ${Math.round(m.refundNegRate * 100)}% of negatives`,
            severity: 0.15,
            color: '#c0392b'
        },

        // ============================================================
        // STDDEV-BASED TAGS  
        // Detecting unusual patterns within a distribution
        // Thresholds: 1σ = unusual (outside 68%), 2σ = very unusual (outside 95%)
        // ============================================================
        
        {
            id: 'DEAD',
            // Was alive, now dead - activity declined from earlier in window
            condition: (m) => m.isEndDead,
            reason: (m) => `Activity declined - tail end is dead`,
            severity: 0.15,
            color: '#444'
        },
        {
            id: 'CULT',
            // Fat tail: 2x+ more players at extreme playtimes than normal distribution predicts
            // AND game is struggling or small
            condition: (m) => m.tailRatio > 0.05 && (m.isEndDead || m.total < 2000),
            reason: (m) => `${Math.round(m.tailRatio * 100)}% at extreme playtimes (expected ~2.5%)`,
            severity: 0,
            color: '#8e44ad'
        },
        {
            id: 'HONEYMOON',
            // Sentiment got worse BUT not extractive - game is honest about getting worse
            condition: (m) => m.temporalDriftZ > 1 && m.medianRatio <= 1.3,
            reason: (m) => `Sentiment declined: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: 0.1,
            color: '#DAA520'
        },
        {
            id: 'REDEMPTION',
            // Sentiment got better: second half 1+ stddev less negative than first half (no revival)
            condition: (m) => m.temporalDriftZ < -1 && !m.hasRevival,
            reason: (m) => `Sentiment improved: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: -0.1,
            color: '#228B22'
        },
        
        // ============================================================
        // REVIVAL TAGS (requires death gap + comeback)
        // 2x2x2 matrix: startedGood × endedGood × stillAlive
        // ============================================================
        
        {
            id: 'PHOENIX',
            // Good → died → came back good → still alive
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio < 0.5 && m.isStillAlive,
            reason: (m) => `Rose from ashes: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, still flying`,
            severity: -0.1,
            color: '#FF4500'
        },
        {
            id: 'PRESS_F',
            // Good → died → came back good → died again
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio < 0.5 && !m.isStillAlive,
            reason: (m) => `Had a good run: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, died with honor`,
            severity: 0,
            color: '#666'
        },
        {
            id: 'ZOMBIE',
            // Good → died → came back bad → still shambling
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio >= 0.5 && m.isStillAlive,
            reason: (m) => `Came back wrong: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, still shambling`,
            severity: 0.2,
            color: '#2d5a27'
        },
        {
            id: 'RUGPULL',
            // Good → died → came back bad → died again
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio >= 0.5 && !m.isStillAlive,
            reason: (m) => `Came back wrong: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, died again`,
            severity: 0.2,
            color: '#8B0000'
        },
        {
            id: '180',
            // Bad → died → came back good → still alive
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio < 0.5 && m.isStillAlive,
            reason: (m) => `Turned it around: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative, redemption arc`,
            severity: -0.15,
            color: '#228B22'
        },
        {
            id: 'HOPELESS',
            // Bad → died → came back good → died anyway
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio < 0.5 && !m.isStillAlive,
            reason: (m) => `Fixed it too late: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative, nobody came back`,
            severity: 0.05,
            color: '#708090'
        },
        {
            id: 'PLAGUE',
            // Bad → died → came back bad → still alive
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio >= 0.5 && m.isStillAlive,
            reason: (m) => `Won't die, won't improve: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative`,
            severity: 0.15,
            color: '#556B2F'
        },
        {
            id: 'CURSED',
            // Bad → died → came back bad → died again
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio >= 0.5 && !m.isStillAlive,
            reason: (m) => `Born bad, died bad, twice: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative`,
            severity: 0.1,
            color: '#1a0d00'
        },
        {
            id: 'ADDICTIVE',
            // Fat upper tail: 95th percentile is 5x+ the median AND 500h+ absolute
            // This is a red flag - people are playing way more than the content justifies
            condition: (m) => m.p95Playtime > m.posMedianReview * 5 && m.p95Playtime > 500 * 60 && m.positiveRatio > 0.5,
            reason: (m) => `Top players at ${Math.round(m.p95Playtime / 60)}h vs ${Math.round(m.posMedianReview / 60)}h median (${Math.round(m.p95Playtime / m.posMedianReview)}x)`,
            severity: 0,
            color: '#e67e22'
        },

        // ============================================================
        // DATA QUALITY TAGS
        // ============================================================
        
        {
            id: 'HORNY',
            // Game has sexual content
            condition: (m) => m.isSexual,
            reason: (m) => `Contains sexual content`,
            severity: 0,
            color: '#ff69b4'
        },
        {
            id: 'LOW_DATA',
            condition: (m) => m.confidence < 0.3,
            reason: (m) => `Only ${m.total} reviews - interpret with caution`,
            severity: 0,
            color: '#999'
        },
        {
            id: 'CORRUPTED',
            condition: (m) => m.anomalyDensity > 0.2,
            reason: (m) => `${Math.round(m.anomalyDensity * 100)}% anomalous data points`,
            severity: 0,
            color: '#666'
        },
        {
            id: 'REVIEW_BOMBED',
            // Any significant negative spike(s) detected
            condition: (m) => m.negativeSpikes?.length > 0 && m.negativeSpikes.some(s => s.z >= 3 && s.count >= 50),
            reason: (m) => {
                const significant = m.negativeSpikes.filter(s => s.z >= 3 && s.count >= 50);
                const totalCount = significant.reduce((sum, s) => sum + s.count, 0);
                const months = significant.map(s => s.month).join(', ');
                return `${significant.length} negative surge${significant.length > 1 ? 's' : ''} (${months}): ${totalCount} reviews excluded`;
            },
            severity: 0,
            color: '#ff6600'
        },
        {
            id: 'SURGE',
            // Positive spikes - could be viral moment, sale, streamer attention
            condition: (m) => m.positiveSpikes?.length > 0 && m.positiveSpikes.some(s => s.z >= 4 && s.count >= 100 && s.multiple >= 3),
            reason: (m) => {
                const significant = m.positiveSpikes.filter(s => s.z >= 4 && s.count >= 100 && s.multiple >= 3);
                const months = significant.map(s => s.month).join(', ');
                return `Viral moment in ${months} (excluded from stats)`;
            },
            severity: 0,
            color: '#00cc66'
        }
    ],

    /**
     * Compute all metrics from a snapshot
     */
    compute(snapshot, options = {}) {
        const buckets = snapshot.bucketsByReviewTime;
        const totalBuckets = snapshot.bucketsByTotalTime;
        const filter = options.timelineFilter || null;
        const isFree = options.isFree || false;
        const isSexual = options.isSexual || false;

        // Detect spikes on FULL timeline (not filtered window)
        // A spike is a spike regardless of what slice you're viewing
        const spikeData = this.detectSpikes(buckets, null);
        
        // Filter spikes to only those within the selected window
        const filterSpikesToWindow = (spikes) => {
            if (!filter || !filter.from) return spikes;
            return spikes.filter(s => s.month >= filter.from && s.month <= filter.to);
        };
        
        const windowNegativeSpikes = filterSpikesToWindow(spikeData.negativeSpikes);
        const windowPositiveSpikes = filterSpikesToWindow(spikeData.positiveSpikes);
        
        // Build list of months to exclude (only spikes within current window)
        const excludeMonths = [];
        const total = this.computeCounts(buckets, filter).total;
        
        // Exclude negative spikes above threshold
        for (const spike of windowNegativeSpikes) {
            if (spike.z >= 3 && spike.count >= 50) {
                excludeMonths.push(spike.month);
            }
        }
        
        // Exclude positive spikes only if they meet stricter threshold
        for (const spike of windowPositiveSpikes) {
            if (spike.z >= 4 && spike.count >= 100 && spike.multiple >= 3) {
                excludeMonths.push(spike.month);
            }
        }
        
        // Create organic filter that excludes spike months
        const organicFilter = excludeMonths.length > 0 
            ? { ...filter, excludeMonths } 
            : filter;

        // Review counts (organic)
        const counts = this.computeCounts(buckets, organicFilter);
        const organicTotal = Math.max(1, counts.total);
        
        // Mass ratios
        const positiveRatio = (counts.positive + counts.uncertainPositive) / organicTotal;
        const negativeRatio = (counts.negative + counts.uncertainNegative) / organicTotal;

        // Playtime distributions (organic)
        const posPlaytimes = this.getPlaytimeArray(buckets, 'positive', organicFilter);
        const negPlaytimes = this.getPlaytimeArray(buckets, 'negative', organicFilter);
        const allPlaytimes = [...posPlaytimes, ...negPlaytimes];
        
        const posStats = this.computeStats(posPlaytimes);
        const negStats = this.computeStats(negPlaytimes);
        const allStats = this.computeStats(allPlaytimes);

        // Medians
        const posMedianReview = posStats.median;
        const negMedianReview = negStats.median;
        
        // Total playtime for stockholm (organic)
        const negTotalPlaytimes = this.getPlaytimeArray(totalBuckets, 'negative', organicFilter);
        const negTotalStats = this.computeStats(negTotalPlaytimes);
        const negMedianTotal = negTotalStats.median;

        // === RATIO-BASED METRICS ===
        const medianRatio = posMedianReview > 0 ? negMedianReview / posMedianReview : 1;
        const stockholmIndex = negMedianReview > 0 ? negMedianTotal / negMedianReview : 1;
        const refundData = isFree ? null : this.computeRefundHonesty(buckets, organicFilter);
        
        // Bimodality detection for negatives
        const negBimodal = this.detectBimodality(buckets, organicFilter);

        // === STDDEV-BASED METRICS ===
        
        // Tail fatness: % of players beyond 2 stddev (normal distribution = ~2.5%)
        const tailThreshold = allStats.mean + 2 * allStats.stddev;
        const tailRatio = allPlaytimes.length > 0 
            ? allPlaytimes.filter(p => p > tailThreshold).length / allPlaytimes.length
            : 0;
        
        // p95 for addictive check
        const p95Playtime = posStats.p95;
        
        // Temporal drift (with stddev context) - use organic filter to exclude spikes
        const temporalData = this.computeTemporalDrift(buckets, organicFilter);
        const temporalDriftZ = temporalData.stddev > 0 
            ? (temporalData.secondHalfNegRatio - temporalData.firstHalfNegRatio) / temporalData.stddev 
            : 0;
        
        // Window end activity (percentile-based)
        const activityData = this.computeWindowEndActivity(buckets, filter);
        const isEndDead = activityData.isInBottomQuartile;
        
        // Revival detection - use WINDOW, not full timeline
        // If revival happened outside the window you're viewing, don't show it
        const revivalData = this.detectRevival(buckets, filter);

        // Confidence
        const confidence = this.computeConfidence(counts.total);
        const anomalyDensity = snapshot.anomalyIndices.length / buckets.length;

        // Bundle
        const metricsBundle = {
            counts,
            total,
            positiveRatio,
            negativeRatio,
            posMedianReview,
            negMedianReview,
            negMedianTotal,
            medianRatio,
            stockholmIndex,
            refundPosRate: refundData?.posRate ?? null,
            refundNegRate: refundData?.negRate ?? null,
            negBimodal,
            confidence,
            anomalyDensity,
            isFree,
            isSexual,
            
            // Stats
            posStats,
            negStats,
            allStats,
            p95Playtime,
            tailRatio,
            
            // Temporal
            firstHalfNegRatio: temporalData.firstHalfNegRatio,
            secondHalfNegRatio: temporalData.secondHalfNegRatio,
            temporalDriftZ,
            isEndDead,
            
            // Revival (180/360)
            hasRevival: revivalData.hasRevival,
            firstWaveNegRatio: revivalData.firstWaveNegRatio,
            lastWaveNegRatio: revivalData.lastWaveNegRatio,
            revivalSentimentChange: revivalData.revivalSentimentChange,
            isStillAlive: revivalData.isStillAlive,
            
            // Spikes (window-filtered for display, detected on full timeline)
            negativeSpikes: windowNegativeSpikes,
            positiveSpikes: windowPositiveSpikes,
            negativeBombZ: windowNegativeSpikes[0]?.z || 0,
            negativeBombMonth: windowNegativeSpikes[0]?.month || null,
            negativeBombMultiple: windowNegativeSpikes[0]?.multiple || 0,
            negativeBombCount: windowNegativeSpikes[0]?.count || 0,
            positiveBombZ: windowPositiveSpikes[0]?.z || 0,
            positiveBombMonth: windowPositiveSpikes[0]?.month || null,
            positiveBombMultiple: windowPositiveSpikes[0]?.multiple || 0,
            positiveBombCount: windowPositiveSpikes[0]?.count || 0,
            excludedMonths: excludeMonths
        };

        // Derive tags
        const verdict = this.deriveVerdict(metricsBundle);

        return {
            ...metricsBundle,
            verdict
        };
    },

    /**
     * Get array of playtimes for statistical analysis
     */
    getPlaytimeArray(buckets, type, filter) {
        const values = [];
        
        for (const bucket of buckets) {
            const f = this.filterBucket(bucket, filter);
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            const count = type === 'positive' 
                ? f.pos + f.uncPos 
                : f.neg + f.uncNeg;
            
            for (let i = 0; i < count; i++) {
                values.push(midpoint);
            }
        }
        
        return values;
    },

    /**
     * Compute statistics from an array of values
     */
    computeStats(values) {
        if (values.length === 0) {
            return { mean: 0, median: 0, stddev: 0, p95: 0 };
        }
        
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const median = sorted[Math.floor(n / 2)];
        const p95 = sorted[Math.floor(n * 0.95)];
        
        const squaredDiffs = values.map(v => (v - mean) ** 2);
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
        const stddev = Math.sqrt(variance);
        
        return { mean, median, stddev, p95 };
    },

    /**
     * Detect bimodal distribution in negatives
     * Extraction signature: some bounce early (<20h), some get trapped late (>100h)
     * Both clusters need significant mass (>15% each) to count as bimodal
     */
    detectBimodality(buckets, filter) {
        const earlyThreshold = 20 * 60;  // 20 hours in minutes
        const lateThreshold = 100 * 60;  // 100 hours in minutes
        const minClusterRatio = 0.15;    // Each cluster needs 15%+ of negatives
        
        let earlyCount = 0;
        let lateCount = 0;
        let totalNeg = 0;
        
        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const neg = filtered.neg + filtered.uncNeg;
            totalNeg += neg;
            
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            
            if (midpoint < earlyThreshold) {
                earlyCount += neg;
            } else if (midpoint > lateThreshold) {
                lateCount += neg;
            }
        }
        
        if (totalNeg < 50) {
            return { isBimodal: false, earlyRatio: 0, lateRatio: 0, totalNeg };
        }
        
        const earlyRatio = earlyCount / totalNeg;
        const lateRatio = lateCount / totalNeg;
        
        // Bimodal if both clusters have significant mass
        const isBimodal = earlyRatio >= minClusterRatio && lateRatio >= minClusterRatio;
        
        return {
            isBimodal,
            earlyRatio,
            lateRatio,
            earlyCount,
            lateCount,
            totalNeg
        };
    },

    /**
     * Compute temporal drift - compare RECENT (last 12 months) vs EARLIER
     * This catches "game is getting worse NOW" better than arbitrary halves
     */
    computeTemporalDrift(buckets, filter) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }

        let sortedMonths = [...allMonths].sort();
        
        if (filter) {
            sortedMonths = sortedMonths.filter(m => {
                if (filter.from && m < filter.from) return false;
                if (filter.to && m > filter.to) return false;
                if (filter.excludeMonths && filter.excludeMonths.includes(m)) return false;
                return true;
            });
        }
        
        if (sortedMonths.length < 6) {
            return { firstHalfNegRatio: 0, secondHalfNegRatio: 0, stddev: 0 };
        }

        // Compute monthly negative ratios for stddev
        const monthlyRatios = [];
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            if (pos + neg > 0) {
                monthlyRatios.push(neg / (pos + neg));
            }
        }
        
        // Split: last 12 months vs everything before
        const recentMonths = 12;
        const cutoff = Math.max(0, sortedMonths.length - recentMonths);
        const earlierPeriod = { from: sortedMonths[0], to: sortedMonths[cutoff - 1] || sortedMonths[0], excludeMonths: filter?.excludeMonths };
        const recentPeriod = { from: sortedMonths[cutoff], to: sortedMonths[sortedMonths.length - 1], excludeMonths: filter?.excludeMonths };

        const earlierCounts = this.computeCounts(buckets, earlierPeriod);
        const recentCounts = this.computeCounts(buckets, recentPeriod);
        
        const firstHalfNegRatio = earlierCounts.total > 0 
            ? (earlierCounts.negative + earlierCounts.uncertainNegative) / earlierCounts.total 
            : 0;
        const secondHalfNegRatio = recentCounts.total > 0 
            ? (recentCounts.negative + recentCounts.uncertainNegative) / recentCounts.total 
            : 0;
        
        const ratioStats = this.computeStats(monthlyRatios);

        return { 
            firstHalfNegRatio, 
            secondHalfNegRatio, 
            stddev: ratioStats.stddev || 0.1
        };
    },

    /**
     * Get monthly activity data from buckets
     * @param buckets - histogram buckets
     * @param filter - optional filter for window
     * @returns { months: string[], activity: {month, count, pos, neg}[], p25: number, p75: number }
     */
    getMonthlyActivityData(buckets, filter = null) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainPositiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainNegativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        
        if (filter && filter.from) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        }
        
        const activity = sortedMonths.map(month => {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            return { month, pos, neg, count: pos + neg };
        });
        
        if (activity.length === 0) {
            return { months: [], activity: [], p25: 0, p75: 0 };
        }
        
        const sortedByCount = [...activity].sort((a, b) => a.count - b.count);
        const p10 = sortedByCount[Math.floor(sortedByCount.length * 0.10)].count;
        const p25 = sortedByCount[Math.floor(sortedByCount.length * 0.25)].count;
        const p75 = sortedByCount[Math.floor(sortedByCount.length * 0.75)].count;
        
        return { months: sortedMonths, activity, p10, p25, p75 };
    },

    /**
     * Compute window end activity - detect DYING (was alive, now dead)
     * Compare end of window to earlier activity in same window
     */
    computeWindowEndActivity(buckets, filter) {
        const windowData = this.getMonthlyActivityData(buckets, filter);
        
        if (windowData.activity.length < 6) {
            return { endActivity: 1, startActivity: 1, isInBottomQuartile: false };
        }
        
        const activity = windowData.activity;
        
        // First half activity (average)
        const firstHalfCount = Math.floor(activity.length / 2);
        const firstHalf = activity.slice(0, firstHalfCount);
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        
        // Last 3 months activity (average)
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        
        // Dead if end activity is less than 20% of start activity (80%+ decline)
        const isInBottomQuartile = startActivity > 0 && endActivity < startActivity * 0.2;
        
        return {
            endActivity,
            startActivity,
            isInBottomQuartile
        };
    },

    /**
     * Detect revival pattern - game died, came back
     * Death = activity dropped to <20% of previous levels (consistent with DEAD logic)
     */
    detectRevival(buckets, filter) {
        const windowData = this.getMonthlyActivityData(buckets, filter);
        
        if (windowData.activity.length < 6) {
            return { hasRevival: false };
        }
        
        const activity = windowData.activity;
        
        // Find death/revival pattern using relative decline
        // Death = 3+ consecutive months at <20% of prior activity
        // Revival = jump back to >50% of prior activity
        let hasRevival = false;
        let firstWaveData = { pos: 0, neg: 0 };
        let lastWaveData = { pos: 0, neg: 0 };
        let deathStartIdx = -1;
        
        // Calculate rolling average (3 month window) to smooth noise
        const getAvg = (start, end) => {
            const slice = activity.slice(start, end);
            return slice.length > 0 ? slice.reduce((sum, m) => sum + m.count, 0) / slice.length : 0;
        };
        
        // Look for death: activity drops to <20% of previous 6 month average
        for (let i = 6; i < activity.length - 3; i++) {
            const priorAvg = getAvg(i - 6, i);
            const currentAvg = getAvg(i, i + 3);
            
            if (priorAvg > 0 && currentAvg < priorAvg * 0.2) {
                // Found death, now look for revival
                for (let j = i + 3; j < activity.length - 2; j++) {
                    const revivalAvg = getAvg(j, j + 3);
                    if (revivalAvg >= priorAvg * 0.5) {
                        // Found revival
                        hasRevival = true;
                        deathStartIdx = i;
                        
                        // First wave = everything before death
                        for (let k = 0; k < i; k++) {
                            firstWaveData.pos += activity[k].pos;
                            firstWaveData.neg += activity[k].neg;
                        }
                        // Last wave = from revival onwards
                        for (let k = j; k < activity.length; k++) {
                            lastWaveData.pos += activity[k].pos;
                            lastWaveData.neg += activity[k].neg;
                        }
                        break;
                    }
                }
                if (hasRevival) break;
            }
        }
        
        if (!hasRevival) {
            return { hasRevival: false };
        }
        
        const firstWaveNegRatio = firstWaveData.neg / Math.max(1, firstWaveData.pos + firstWaveData.neg);
        const lastWaveNegRatio = lastWaveData.neg / Math.max(1, lastWaveData.pos + lastWaveData.neg);
        
        // Is it still alive? Same logic as DEAD - compare end to earlier post-revival
        const postRevivalStart = deathStartIdx + 6; // rough estimate
        const postRevivalActivity = activity.slice(postRevivalStart);
        if (postRevivalActivity.length < 6) {
            return { hasRevival: true, firstWaveNegRatio, lastWaveNegRatio, revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio, isStillAlive: true };
        }
        
        const firstHalf = postRevivalActivity.slice(0, Math.floor(postRevivalActivity.length / 2));
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        const isStillAlive = startActivity === 0 || endActivity >= startActivity * 0.2;
        
        return {
            hasRevival: true,
            firstWaveNegRatio,
            lastWaveNegRatio,
            revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio,
            isStillAlive
        };
    },

    /**
     * Detect review spikes (bombs or botting)
     * Uses LOCAL comparison: each month vs its ±3 month neighbors
     * Returns ALL spikes above threshold, not just the biggest
     */
    detectSpikes(buckets, filter) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        if (filter) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        }
        
        if (sortedMonths.length < 3) {
            return {
                negativeSpikes: [], positiveSpikes: [],
                negativeBombZ: 0, negativeBombMonth: null, negativeBombMultiple: 0, negativeBombCount: 0,
                positiveBombZ: 0, positiveBombMonth: null, positiveBombMultiple: 0, positiveBombCount: 0
            };
        }
        
        // Count monthly positives and negatives
        const monthlyData = [];
        
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            monthlyData.push({ month, pos, neg, total: pos + neg });
        }
        
        // Find ALL spikes using LOCAL comparison (rolling window) on TOTAL activity
        const windowSize = 3; // +/-3 months = 7 month window
        const spikeThreshold = 2.5; // Z-score threshold for spike detection
        
        const negativeSpikes = [];
        const positiveSpikes = [];
        
        for (let i = 0; i < monthlyData.length; i++) {
            const m = monthlyData[i];
            
            // Get neighbors (excluding self)
            const neighbors = [];
            for (let j = Math.max(0, i - windowSize); j <= Math.min(monthlyData.length - 1, i + windowSize); j++) {
                if (j !== i) neighbors.push(monthlyData[j].total);
            }
            
            if (neighbors.length < 2) continue;
            
            const localStats = this.computeStats(neighbors);
            if (localStats.stddev === 0) continue;
            
            const z = localStats.stddev > 0 ? (m.total - localStats.mean) / localStats.stddev : 0;
            
            // Launch weight: discount early months (month 0 = 0%, month 6 = 63%, month 12 = 86%)
            const launchWeight = 1 - Math.exp(-i / 6);
            const effectiveZ = z * launchWeight;
            
            if (effectiveZ >= spikeThreshold) {
                // Determine if this is a negative or positive spike based on sentiment
                // >2/3 negative = review bomb, >2/3 positive = surge
                const negRatio = m.total > 0 ? m.neg / m.total : 0;
                const spikeData = {
                    month: m.month,
                    z: effectiveZ,
                    rawZ: z,
                    multiple: localStats.mean > 0 ? m.total / localStats.mean : m.total,
                    count: m.total,
                    negCount: m.neg,
                    posCount: m.pos,
                    negRatio,
                    launchWeight
                };
                
                if (negRatio > 2/3) {
                    negativeSpikes.push(spikeData);
                } else if (negRatio < 1/3) {
                    positiveSpikes.push(spikeData);
                }
                // If between 1/3 and 2/3, it's mixed - not a bomb or surge, ignore it
            }
        }
        
        // Sort by Z-score descending
        negativeSpikes.sort((a, b) => b.z - a.z);
        positiveSpikes.sort((a, b) => b.z - a.z);
        
        // For backwards compat, also return the biggest spike in old format
        const biggestNeg = negativeSpikes[0] || { z: 0, month: null, multiple: 0, count: 0 };
        const biggestPos = positiveSpikes[0] || { z: 0, month: null, multiple: 0, count: 0 };
        
        return {
            negativeSpikes,
            positiveSpikes,
            // Legacy fields for biggest spike
            negativeBombZ: biggestNeg.z,
            negativeBombMonth: biggestNeg.month,
            negativeBombMultiple: biggestNeg.multiple,
            negativeBombCount: biggestNeg.count,
            positiveBombZ: biggestPos.z,
            positiveBombMonth: biggestPos.month,
            positiveBombMultiple: biggestPos.multiple,
            positiveBombCount: biggestPos.count
        };
    },

    /**
     * Run all tag conditions and stack results
     */
    deriveVerdict(m) {
        let tags = [];
        let totalSeverity = 0;
        const reasons = [];

        for (const def of this.tagDefinitions) {
            try {
                if (def.condition(m)) {
                    const severity = typeof def.severity === 'function' ? def.severity(m) : def.severity;
                    const reason = typeof def.reason === 'function' ? def.reason(m) : def.reason;
                    
                    tags.push({
                        id: def.id,
                        severity,
                        reason,
                        color: def.color
                    });
                    
                    totalSeverity += severity;
                    reasons.push(reason);
                }
            } catch (e) {
                console.warn(`Tag ${def.id} failed:`, e);
            }
        }

        tags = tags.filter(t => {
            const dominated_by = Object.entries(Metrics.hierarchies)
                .filter(([superior, inferiors]) => inferiors.includes(t.id) && tags.some(x => x.id === superior));
            return dominated_by.length === 0;
        });

        tags.sort((a, b) => Math.abs(b.severity) - Math.abs(a.severity));

        const primaryTag = tags[0]?.id || 'NEUTRAL';
        const normalizedSeverity = Math.max(0, Math.min(1, (totalSeverity + 0.3) / 0.6));

        return {
            tags,
            primaryTag,
            severity: normalizedSeverity,
            rawSeverity: totalSeverity,
            reasons
        };
    },

    /**
     * Compute total review counts
     */
    computeCounts(buckets, filter = null) {
        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            pos += filtered.pos;
            neg += filtered.neg;
            uncPos += filtered.uncPos;
            uncNeg += filtered.uncNeg;
        }

        return {
            positive: pos,
            negative: neg,
            uncertainPositive: uncPos,
            uncertainNegative: uncNeg,
            certain: pos + neg,
            uncertain: uncPos + uncNeg,
            total: pos + neg + uncPos + uncNeg
        };
    },

    /**
     * What percentage of positive/negative reviews came before the 2h refund window?
     */
    computeRefundHonesty(buckets, filter = null) {
        let posBeforeRefund = 0, negBeforeRefund = 0;
        let posTotal = 0, negTotal = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const pos = filtered.pos + filtered.uncPos;
            const neg = filtered.neg + filtered.uncNeg;
            posTotal += pos;
            negTotal += neg;

            if (bucket.maxPlaytime <= 120) {
                posBeforeRefund += pos;
                negBeforeRefund += neg;
            } else if (bucket.minPlaytime < 120) {
                const ratio = (120 - bucket.minPlaytime) / (bucket.maxPlaytime - bucket.minPlaytime);
                posBeforeRefund += pos * ratio;
                negBeforeRefund += neg * ratio;
            }
        }

        return {
            posRate: posTotal > 0 ? posBeforeRefund / posTotal : 0,
            negRate: negTotal > 0 ? negBeforeRefund / negTotal : 0
        };
    },

    /**
     * Confidence based on sample size
     */
    computeConfidence(sampleSize) {
        if (sampleSize < 100) return 0.1;
        if (sampleSize < 500) return 0.3;
        if (sampleSize < 1000) return 0.5;
        if (sampleSize < 5000) return 0.7;
        if (sampleSize < 10000) return 0.85;
        return 1.0;
    },

    /**
     * Filter bucket counts by timeline range and excluded months
     */
    filterBucket(bucket, filter) {
        if (!filter) {
            return {
                pos: bucket.positiveCount,
                neg: bucket.negativeCount,
                uncPos: bucket.uncertainPositiveCount,
                uncNeg: bucket.uncertainNegativeCount
            };
        }

        const excludeSet = new Set(filter.excludeMonths || []);
        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const [month, count] of Object.entries(bucket.positiveByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) pos += count;
        }
        for (const [month, count] of Object.entries(bucket.negativeByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) neg += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) uncPos += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) uncNeg += count;
        }

        return { pos, neg, uncPos, uncNeg };
    },
    
    /**
     * Check if month is in filter range (or no range specified)
     */
    monthInRange(month, filter) {
        if (!filter || (!filter.from && !filter.to)) return true;
        if (filter.from && month < filter.from) return false;
        if (filter.to && month > filter.to) return false;
        return true;
    }
};

window.Metrics = Metrics;
