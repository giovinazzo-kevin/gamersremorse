/**
 * Metrics module for gamersremorse
 * Pure analysis functions - no UI, no side effects
 * 
 * Two types of metrics:
 * 1. RATIO-BASED: Comparing two groups (positive vs negative). Thresholds are intuitive percentages.
 * 2. STDDEV-BASED: Detecting unusual patterns within a distribution. Thresholds are statistical.
 */

const Metrics = {
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
            // Negatives play 30%+ longer before reviewing - game hides its problems
            condition: (m) => m.medianRatio > 1.3 && m.negativeRatio > 0.15,
            reason: (m) => `Negatives at ${Math.round(m.negMedianReview / 60)}h vs positives at ${Math.round(m.posMedianReview / 60)}h (${Math.round((m.medianRatio - 1) * 100)}% longer)`,
            severity: (m) => Math.min(0.3, (m.medianRatio - 1) * 0.3),
            color: '#cc4400'
        },
        {
            id: 'PREDATORY',
            // Extractive (50%+ longer) AND lots of people affected (30%+ negative)
            condition: (m) => m.medianRatio > 1.5 && m.negativeRatio > 0.30,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative after ${Math.round(m.negMedianReview / 60)}h median (${Math.round((m.medianRatio - 1) * 100)}% longer than positive)`,
            severity: 0.25,
            color: '#e74c3c'
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
            id: 'REFUND_TRAP',
            // Less than 10% of negative reviews before 2h refund window
            // (compared to where you'd expect them based on positive distribution)
            condition: (m) => m.refundHonesty !== null && m.refundHonesty < 0.10 && m.negativeRatio > 0.15,
            reason: (m) => `Only ${Math.round(m.refundHonesty * 100)}% of negatives before 2h refund window`,
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
            // End-of-period activity 1+ stddev below the period's average monthly activity
            condition: (m) => m.windowEndActivityZ < -1 && m.total > 500,
            reason: (m) => `End-of-period activity ${Math.abs(m.windowEndActivityZ).toFixed(1)}σ below average`,
            severity: 0.15,
            color: '#444'
        },
        {
            id: 'CULT',
            // Fat tail: 2x+ more players at extreme playtimes than normal distribution predicts
            // AND game is struggling or small
            condition: (m) => m.tailRatio > 0.05 && (m.windowEndActivityZ < -0.5 || m.total < 2000),
            reason: (m) => `${Math.round(m.tailRatio * 100)}% at extreme playtimes (expected ~2.5%)`,
            severity: 0,
            color: '#8e44ad'
        },
        {
            id: 'HONEYMOON',
            // Sentiment got worse: second half 1+ stddev more negative than first half
            condition: (m) => m.temporalDriftZ > 1,
            reason: (m) => `Sentiment declined: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: 0.1,
            color: '#DAA520'
        },
        {
            id: 'REDEMPTION',
            // Sentiment got better: second half 1+ stddev less negative than first half  
            condition: (m) => m.temporalDriftZ < -1,
            reason: (m) => `Sentiment improved: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: -0.1,
            color: '#228B22'
        },
        {
            id: 'ADDICTIVE',
            // Fat upper tail: 95th percentile is 5x+ the median (people get HOOKED)
            condition: (m) => m.p95Playtime > m.posMedianReview * 5 && m.positiveRatio > 0.5,
            reason: (m) => `Top players at ${Math.round(m.p95Playtime / 60)}h vs ${Math.round(m.posMedianReview / 60)}h median (${Math.round(m.p95Playtime / m.posMedianReview)}x)`,
            severity: 0,
            color: '#e67e22'
        },

        // ============================================================
        // DATA QUALITY TAGS
        // ============================================================
        
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
            // Massive negative spike AND it's bigger than any positive spike
            condition: (m) => m.negativeBombZ > 3 && m.negativeBombZ >= m.positiveBombZ,
            reason: (m) => `Negative surge in ${m.negativeBombMonth}: ${m.negativeBombMultiple.toFixed(1)}x normal volume`,
            severity: 0,
            color: '#ff6600'
        },
        {
            id: 'REVIEW_BRIGADED',
            // Massive positive spike AND it's bigger than any negative spike
            condition: (m) => m.positiveBombZ > 3 && m.positiveBombZ > m.negativeBombZ,
            reason: (m) => `Positive surge in ${m.positiveBombMonth}: ${m.positiveBombMultiple.toFixed(1)}x normal volume`,
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

        // Review counts
        const counts = this.computeCounts(buckets, filter);
        const total = Math.max(1, counts.total);
        
        // Mass ratios
        const positiveRatio = (counts.positive + counts.uncertainPositive) / total;
        const negativeRatio = (counts.negative + counts.uncertainNegative) / total;

        // Playtime distributions
        const posPlaytimes = this.getPlaytimeArray(buckets, 'positive', filter);
        const negPlaytimes = this.getPlaytimeArray(buckets, 'negative', filter);
        const allPlaytimes = [...posPlaytimes, ...negPlaytimes];
        
        const posStats = this.computeStats(posPlaytimes);
        const negStats = this.computeStats(negPlaytimes);
        const allStats = this.computeStats(allPlaytimes);

        // Medians
        const posMedianReview = posStats.median;
        const negMedianReview = negStats.median;
        
        // Total playtime for stockholm
        const negTotalPlaytimes = this.getPlaytimeArray(totalBuckets, 'negative', filter);
        const negTotalStats = this.computeStats(negTotalPlaytimes);
        const negMedianTotal = negTotalStats.median;

        // === RATIO-BASED METRICS ===
        const medianRatio = posMedianReview > 0 ? negMedianReview / posMedianReview : 1;
        const stockholmIndex = negMedianReview > 0 ? negMedianTotal / negMedianReview : 1;
        const refundHonesty = isFree ? null : this.computeRefundHonesty(buckets, filter);

        // === STDDEV-BASED METRICS ===
        
        // Tail fatness: % of players beyond 2 stddev (normal distribution = ~2.5%)
        const tailThreshold = allStats.mean + 2 * allStats.stddev;
        const tailRatio = allPlaytimes.length > 0 
            ? allPlaytimes.filter(p => p > tailThreshold).length / allPlaytimes.length
            : 0;
        
        // p95 for addictive check
        const p95Playtime = posStats.p95;
        
        // Temporal drift (with stddev context)
        const temporalData = this.computeTemporalDrift(buckets, filter);
        const temporalDriftZ = temporalData.stddev > 0 
            ? (temporalData.secondHalfNegRatio - temporalData.firstHalfNegRatio) / temporalData.stddev 
            : 0;
        
        // Window end activity (with stddev context)
        const activityData = this.computeWindowEndActivity(buckets, filter);
        const windowEndActivityZ = activityData.stddev > 0 
            ? (activityData.endActivity - activityData.meanActivity) / activityData.stddev 
            : 0;
        
        // Spike detection (review bombs / botting)
        const spikeData = this.detectSpikes(buckets, filter);

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
            refundHonesty,
            confidence,
            anomalyDensity,
            isFree,
            
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
            windowEndActivityZ,
            
            // Spikes
            negativeBombZ: spikeData.negativeBombZ,
            negativeBombMonth: spikeData.negativeBombMonth,
            negativeBombMultiple: spikeData.negativeBombMultiple,
            positiveBombZ: spikeData.positiveBombZ,
            positiveBombMonth: spikeData.positiveBombMonth,
            positiveBombMultiple: spikeData.positiveBombMultiple
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
     * Compute temporal drift with its own statistical context
     */
    computeTemporalDrift(buckets, filter) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }

        let sortedMonths = [...allMonths].sort();
        
        if (filter) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
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
        
        const midpoint = Math.floor(sortedMonths.length / 2);
        const firstHalf = { from: sortedMonths[0], to: sortedMonths[midpoint - 1] };
        const secondHalf = { from: sortedMonths[midpoint], to: sortedMonths[sortedMonths.length - 1] };

        const firstCounts = this.computeCounts(buckets, firstHalf);
        const secondCounts = this.computeCounts(buckets, secondHalf);
        
        const firstHalfNegRatio = firstCounts.total > 0 
            ? (firstCounts.negative + firstCounts.uncertainNegative) / firstCounts.total 
            : 0;
        const secondHalfNegRatio = secondCounts.total > 0 
            ? (secondCounts.negative + secondCounts.uncertainNegative) / secondCounts.total 
            : 0;
        
        const ratioStats = this.computeStats(monthlyRatios);

        return { 
            firstHalfNegRatio, 
            secondHalfNegRatio, 
            stddev: ratioStats.stddev || 0.1
        };
    },

    /**
     * Compute window end activity with statistical context
     */
    computeWindowEndActivity(buckets, filter) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainPositiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainNegativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        
        if (filter) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        }
        
        if (sortedMonths.length < 5) {
            return { endActivity: 1, meanActivity: 1, stddev: 0 };
        }
        
        // Monthly activity counts
        const monthlyActivity = [];
        for (const month of sortedMonths) {
            let count = 0;
            for (const bucket of buckets) {
                count += (bucket.positiveByMonth?.[month] || 0);
                count += (bucket.negativeByMonth?.[month] || 0);
                count += (bucket.uncertainPositiveByMonth?.[month] || 0);
                count += (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            monthlyActivity.push(count);
        }
        
        const activityStats = this.computeStats(monthlyActivity);
        
        // Last 20% of months
        const cutoffIdx = Math.floor(sortedMonths.length * 0.8);
        const endMonthsActivity = monthlyActivity.slice(cutoffIdx);
        const endActivity = endMonthsActivity.reduce((a, b) => a + b, 0) / endMonthsActivity.length;
        
        return {
            endActivity,
            meanActivity: activityStats.mean,
            stddev: activityStats.stddev || 1
        };
    },

    /**
     * Detect review spikes (bombs or botting)
     * A spike is a month with volume 3σ+ above the mean
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
                negativeBombZ: 0, negativeBombMonth: null, negativeBombMultiple: 0,
                positiveBombZ: 0, positiveBombMonth: null, positiveBombMultiple: 0
            };
        }
        
        // Count monthly positives and negatives
        const monthlyPos = [];
        const monthlyNeg = [];
        
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            monthlyPos.push({ month, count: pos });
            monthlyNeg.push({ month, count: neg });
        }
        
        // Find spikes
        const findSpike = (monthlyData) => {
            const counts = monthlyData.map(m => m.count);
            const stats = this.computeStats(counts);
            
            let maxZ = 0;
            let spikeMonth = null;
            let spikeMultiple = 0;
            
            for (const m of monthlyData) {
                if (stats.stddev > 0 && stats.mean > 0) {
                    const z = (m.count - stats.mean) / stats.stddev;
                    if (z > maxZ) {
                        maxZ = z;
                        spikeMonth = m.month;
                        spikeMultiple = m.count / stats.mean;
                    }
                }
            }
            
            return { z: maxZ, month: spikeMonth, multiple: spikeMultiple };
        };
        
        const negSpike = findSpike(monthlyNeg);
        const posSpike = findSpike(monthlyPos);
        
        return {
            negativeBombZ: negSpike.z,
            negativeBombMonth: negSpike.month,
            negativeBombMultiple: negSpike.multiple,
            positiveBombZ: posSpike.z,
            positiveBombMonth: posSpike.month,
            positiveBombMultiple: posSpike.multiple
        };
    },

    /**
     * Run all tag conditions and stack results
     */
    deriveVerdict(m) {
        const tags = [];
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
     * What percentage of negative reviews came before the 2h refund window?
     */
    computeRefundHonesty(buckets, filter = null) {
        let negBeforeRefund = 0;
        let negTotal = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const neg = filtered.neg + filtered.uncNeg;
            negTotal += neg;

            if (bucket.maxPlaytime <= 120) {
                negBeforeRefund += neg;
            } else if (bucket.minPlaytime < 120) {
                const ratio = (120 - bucket.minPlaytime) / (bucket.maxPlaytime - bucket.minPlaytime);
                negBeforeRefund += neg * ratio;
            }
        }

        return negTotal > 0 ? negBeforeRefund / negTotal : 0.5;
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
     * Filter bucket counts by timeline range
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

        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const [month, count] of Object.entries(bucket.positiveByMonth || {})) {
            if (month >= filter.from && month <= filter.to) pos += count;
        }
        for (const [month, count] of Object.entries(bucket.negativeByMonth || {})) {
            if (month >= filter.from && month <= filter.to) neg += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth || {})) {
            if (month >= filter.from && month <= filter.to) uncPos += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth || {})) {
            if (month >= filter.from && month <= filter.to) uncNeg += count;
        }

        return { pos, neg, uncPos, uncNeg };
    }
};

window.Metrics = Metrics;
