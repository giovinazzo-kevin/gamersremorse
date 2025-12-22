/**
 * Binary snapshot reader for gamersremorse
 * Parses compact binary format into snapshot object
 * 
 * V2: Uses typed arrays instead of dictionaries for month data.
 * All month-indexed data is stored as Uint16Array parallel to snapshot.months.
 * This eliminates Object.entries() iteration overhead.
 * 
 * PROJECTION: Single source of truth for timeline projection.
 * Call projectMonthlyData() once after parse, all consumers read from it.
 */

const BinarySnapshot = {
    parse(buffer) {
        const view = new DataView(buffer);
        const decoder = new TextDecoder('ascii');
        let offset = 0;

        const readU8 = () => view.getUint8(offset++);
        const readU16 = () => { const v = view.getUint16(offset, true); offset += 2; return v; };
        const readI32 = () => { const v = view.getInt32(offset, true); offset += 4; return v; };
        const readF64 = () => { const v = view.getFloat64(offset, true); offset += 8; return v; };
        const readString = (len) => {
            const bytes = new Uint8Array(buffer, offset, len);
            offset += len;
            return decoder.decode(bytes).trim();
        };

        const version = readU8();
        if (version !== 1) throw new Error(`Unknown binary snapshot version: ${version}`);
        
        const monthCount = readU16();
        const reviewBucketCount = readU8();
        const totalBucketCount = readU8();
        const velocityBucketCount = readU8();

        // Global months array - all buckets reference this by index
        const months = [];
        for (let i = 0; i < monthCount; i++) {
            months.push(readString(7));
        }

        // Build month->index lookup (plain object for postMessage compatibility)
        const monthIndex = {};
        for (let i = 0; i < monthCount; i++) {
            monthIndex[months[i]] = i;
        }

        // Read bucket channels as typed arrays
        const readBucketChannelsTyped = () => {
            const pos = new Uint16Array(monthCount);
            const neg = new Uint16Array(monthCount);
            const uncPos = new Uint16Array(monthCount);
            const uncNeg = new Uint16Array(monthCount);
            let posCount = 0, negCount = 0, uncPosCount = 0, uncNegCount = 0;
            
            for (let i = 0; i < monthCount; i++) {
                const v = readU16();
                pos[i] = v;
                posCount += v;
            }
            for (let i = 0; i < monthCount; i++) {
                const v = readU16();
                neg[i] = v;
                negCount += v;
            }
            for (let i = 0; i < monthCount; i++) {
                const v = readU16();
                uncPos[i] = v;
                uncPosCount += v;
            }
            for (let i = 0; i < monthCount; i++) {
                const v = readU16();
                uncNeg[i] = v;
                uncNegCount += v;
            }
            return { pos, neg, uncPos, uncNeg, posCount, negCount, uncPosCount, uncNegCount };
        };

        const bucketsByReviewTime = [];
        for (let i = 0; i < reviewBucketCount; i++) {
            const minPlaytime = readF64();
            const maxPlaytime = readF64();
            const ch = readBucketChannelsTyped();
            bucketsByReviewTime.push({
                minPlaytime,
                maxPlaytime,
                pos: ch.pos,
                neg: ch.neg,
                uncPos: ch.uncPos,
                uncNeg: ch.uncNeg,
                positiveCount: ch.posCount,
                negativeCount: ch.negCount,
                uncertainPositiveCount: ch.uncPosCount,
                uncertainNegativeCount: ch.uncNegCount
            });
        }

        const bucketsByTotalTime = [];
        for (let i = 0; i < totalBucketCount; i++) {
            const minPlaytime = readF64();
            const maxPlaytime = readF64();
            const ch = readBucketChannelsTyped();
            bucketsByTotalTime.push({
                minPlaytime,
                maxPlaytime,
                pos: ch.pos,
                neg: ch.neg,
                uncPos: ch.uncPos,
                uncNeg: ch.uncNeg,
                positiveCount: ch.posCount,
                negativeCount: ch.negCount,
                uncertainPositiveCount: ch.uncPosCount,
                uncertainNegativeCount: ch.uncNegCount
            });
        }

        const velocityBuckets = [];
        for (let i = 0; i < velocityBucketCount; i++) {
            const minVelocity = readF64();
            const maxVelocity = readF64();
            const ch = readBucketChannelsTyped();
            velocityBuckets.push({
                minVelocity,
                maxVelocity,
                pos: ch.pos,
                neg: ch.neg,
                uncPos: ch.uncPos,
                uncNeg: ch.uncNeg,
                positiveCount: ch.posCount,
                negativeCount: ch.negCount,
                uncertainPositiveCount: ch.uncPosCount,
                uncertainNegativeCount: ch.uncNegCount
            });
        }

        const totalPositive = readI32();
        const totalNegative = readI32();
        const gameTotalPositive = readI32();
        const gameTotalNegative = readI32();
        const targetSampleCount = readI32();
        const positiveSampleRate = readF64();
        const negativeSampleRate = readF64();
        const flags = readU8();

        // Language stats as typed arrays
        const readLanguageChannelTyped = () => {
            const arr = new Uint16Array(monthCount);
            for (let i = 0; i < monthCount; i++) {
                arr[i] = readU16();
            }
            return arr;
        };

        const languageStats = {
            profanity: readLanguageChannelTyped(),
            insults: readLanguageChannelTyped(),
            slurs: readLanguageChannelTyped(),
            banter: readLanguageChannelTyped(),
            complaints: readLanguageChannelTyped()
        };

        // Edit heatmap (keeps dictionary format - sparse 2D data)
        const editMonthCount = readU16();
        const editMonths = [];
        for (let i = 0; i < editMonthCount; i++) {
            editMonths.push(readString(7));
        }

        const cellCount = readI32();
        const cells = {};
        for (let i = 0; i < cellCount; i++) {
            const postedIdx = readU16();
            const editedIdx = readU16();
            const positive = readU16();
            const negative = readU16();
            if (postedIdx < editMonths.length && editedIdx < editMonths.length) {
                cells[`${editMonths[postedIdx]}|${editMonths[editedIdx]}`] = { positive, negative };
            }
        }

        // Pre-compute monthly aggregates for timeline (avoids repeated bucket iteration)
        const monthlyTotals = {
            pos: new Uint32Array(monthCount),
            neg: new Uint32Array(monthCount),
            uncPos: new Uint32Array(monthCount),
            uncNeg: new Uint32Array(monthCount)
        };
        for (const bucket of bucketsByReviewTime) {
            for (let i = 0; i < monthCount; i++) {
                monthlyTotals.pos[i] += bucket.pos[i];
                monthlyTotals.neg[i] += bucket.neg[i];
                monthlyTotals.uncPos[i] += bucket.uncPos[i];
                monthlyTotals.uncNeg[i] += bucket.uncNeg[i];
            }
        }

        const snapshot = {
            months,
            monthIndex,
            monthCount,
            bucketsByReviewTime,
            bucketsByTotalTime,
            velocityBuckets,
            monthlyTotals,
            totalPositive,
            totalNegative,
            gameTotalPositive,
            gameTotalNegative,
            targetSampleCount,
            positiveSampleRate,
            negativeSampleRate,
            positiveExhausted: (flags & 1) !== 0,
            negativeExhausted: (flags & 2) !== 0,
            isStreaming: (flags & 4) !== 0,
            languageStats,
            editHeatmap: { months: editMonths, cells },
            // Will be populated by projectMonthlyData()
            projectedMonthly: null
        };

        // Compute projection immediately after parse
        this.projectMonthlyData(snapshot);

        return snapshot;
    },

    /**
     * Project monthly data using position-based extrapolation.
     * 
     * Steam's cursor is frontloaded - recent months are oversampled.
     * We correct by applying exponential extrapolation: oldest months get
     * scaled up most, newest months stay close to sampled.
     * 
     * Then normalize so total matches Steam's ground truth.
     * 
     * Spike-aware: months more negative than baseline only project negatives,
     * months more positive only project positives.
     * 
     * This is THE source of truth. Called once after parse.
     * drawTimeline and Metrics both read from snapshot.projectedMonthly.
     */
    projectMonthlyData(snapshot) {
        const { months, monthlyTotals, gameTotalPositive, gameTotalNegative,
                positiveExhausted, negativeExhausted } = snapshot;
        
        const gameTotal = gameTotalPositive + gameTotalNegative;
        const trueRatio = gameTotal > 0 ? gameTotalPositive / gameTotal : 0.5;
        
        // Build sampled data per month
        const monthData = [];
        let totalSampled = 0;
        
        for (let i = 0; i < months.length; i++) {
            const pos = monthlyTotals.pos[i];
            const neg = monthlyTotals.neg[i];
            const uncPos = monthlyTotals.uncPos[i];
            const uncNeg = monthlyTotals.uncNeg[i];
            const sampledPos = pos + uncPos;
            const sampledNeg = neg + uncNeg;
            const sampledTotal = sampledPos + sampledNeg;
            totalSampled += sampledTotal;
            
            monthData.push({
                month: months[i],
                pos, neg, uncPos, uncNeg,
                sampledPos, sampledNeg, sampledTotal
            });
        }
        
        if (monthData.length === 0 || totalSampled === 0 || gameTotal === 0) {
            snapshot.projectedMonthly = monthData;
            return;
        }
        
        // Sample rate
        const sampleRate = totalSampled / gameTotal;
        
        // HIGH COVERAGE: If we've sampled 95%+ of reviews, projection IS sampled.
        // No extrapolation needed - we have the real data.
        if (sampleRate >= 0.95) {
            for (const m of monthData) {
                m.projectedPos = m.sampledPos;
                m.projectedNeg = m.sampledNeg;
                m.projectedTotal = m.sampledTotal;
                m.extraPos = 0;
                m.extraNeg = 0;
                m.total = m.sampledTotal;
            }
            snapshot.projectedMonthly = monthData;
            return;
        }
        
        // Position-based extrapolation
        const n = monthData.length;
        const maxMultiplier = sampleRate > 0 ? 1 / sampleRate : 1;
        
        for (let i = 0; i < n; i++) {
            const m = monthData[i];
            // Position 0 = oldest (gets maxMultiplier), position n-1 = newest (gets 1x)
            const positionRatio = n > 1 ? i / (n - 1) : 1;
            const multiplier = Math.pow(maxMultiplier, 1 - positionRatio);
            m.estimatedTrue = m.sampledTotal * multiplier;
        }
        
        // Normalize so estimates sum to gameTotal
        const estimateSum = monthData.reduce((sum, m) => sum + m.estimatedTrue, 0);
        const normalizeFactor = estimateSum > 0 ? gameTotal / estimateSum : 1;
        
        for (const m of monthData) {
            m.projectedTotal = m.estimatedTrue * normalizeFactor;
            
            // Spike-aware projection
            const localRatio = m.sampledTotal > 0 ? m.sampledPos / m.sampledTotal : trueRatio;
            const ratioDiff = localRatio - trueRatio;
            
            if (ratioDiff >= 0) {
                // More positive than usual - project positives, negatives stay sampled
                m.projectedNeg = m.sampledNeg;
                m.projectedPos = Math.max(m.sampledPos, m.projectedTotal - m.projectedNeg);
            } else {
                // More negative than usual - project negatives, positives stay sampled
                m.projectedPos = m.sampledPos;
                m.projectedNeg = Math.max(m.sampledNeg, m.projectedTotal - m.projectedPos);
            }
            
            // Extra is projected minus sampled (for ghost bars)
            m.extraPos = positiveExhausted ? 0 : Math.max(0, m.projectedPos - m.sampledPos);
            m.extraNeg = negativeExhausted ? 0 : Math.max(0, m.projectedNeg - m.sampledNeg);
            
            // Alias for compatibility with detectSpikes
            m.total = m.projectedTotal;
        }
        
        snapshot.projectedMonthly = monthData;
    },

    /**
     * Filter a bucket by month range. Returns totals for that range.
     * Uses typed arrays for fast iteration.
     */
    filterBucket(bucket, months, filter, monthIndex) {
        if (!filter) {
            return {
                pos: bucket.positiveCount,
                neg: bucket.negativeCount,
                uncPos: bucket.uncertainPositiveCount,
                uncNeg: bucket.uncertainNegativeCount
            };
        }

        const fromIdx = filter.from ? (monthIndex[filter.from] ?? 0) : 0;
        const toIdx = filter.to ? (monthIndex[filter.to] ?? months.length - 1) : months.length - 1;
        const excludeSet = filter.excludeMonths ? new Set(filter.excludeMonths) : null;

        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (let i = fromIdx; i <= toIdx; i++) {
            if (excludeSet && excludeSet.has(months[i])) continue;
            pos += bucket.pos[i];
            neg += bucket.neg[i];
            uncPos += bucket.uncPos[i];
            uncNeg += bucket.uncNeg[i];
        }

        return { pos, neg, uncPos, uncNeg };
    },

    /**
     * Get projected monthly data, optionally filtered by window and exclusions.
     * This is what metrics and charts should use.
     * 
     * @param {Object} snapshot - Parsed snapshot with projectedMonthly
     * @param {Object} filter - Optional { from, to, excludeMonths }
     * @param {boolean} usePrediction - If false, returns sampled values instead of projected
     * @returns {Array} Filtered monthly data
     */
    getProjectedMonthly(snapshot, filter = null, usePrediction = true) {
        if (!snapshot.projectedMonthly) return [];
        
        let data = snapshot.projectedMonthly;
        
        // Filter by window
        if (filter?.from || filter?.to) {
            const fromMonth = filter.from || data[0]?.month;
            const toMonth = filter.to || data[data.length - 1]?.month;
            data = data.filter(m => m.month >= fromMonth && m.month <= toMonth);
        }
        
        // Filter by exclusions
        if (filter?.excludeMonths?.length > 0) {
            const excludeSet = new Set(filter.excludeMonths);
            data = data.filter(m => !excludeSet.has(m.month));
        }
        
        // If not using prediction, return with sampled values as the "projected" values
        if (!usePrediction) {
            return data.map(m => ({
                ...m,
                projectedPos: m.sampledPos,
                projectedNeg: m.sampledNeg,
                projectedTotal: m.sampledTotal,
                total: m.sampledTotal,
                extraPos: 0,
                extraNeg: 0
            }));
        }
        
        return data;
    }
};

if (typeof window !== 'undefined') {
    window.BinarySnapshot = BinarySnapshot;
}
