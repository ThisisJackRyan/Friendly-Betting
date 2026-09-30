const IOS_UA = /iPad|iPhone|iPod/i;
const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

// Sign-in stores uid and email only. No display name exists, so texts say Jack.
export const DEFAULT_CREATOR_NAME = 'Jack';

export function betShareText({ creatorName, question, optionA, optionB, stake, url }) {
    const name = String(creatorName || DEFAULT_CREATOR_NAME).trim() || DEFAULT_CREATOR_NAME;
    const q = String(question || '').trim().replace(/\?+\s*$/, '');
    const a = String(optionA || 'Yes').trim() || 'Yes';
    const b = String(optionB || 'No').trim() || 'No';
    const stakeText = String(stake || '').trim();
    const stakeClause = stakeText ? ` — ${stakeText}` : '';
    const vote = url ? ` Vote: ${url}` : '';
    return `${name}: ${q}? ${a}/${b}${stakeClause}.${vote}`;
}

export function buildSmsHref(body, userAgent = '') {
    const encoded = encodeURIComponent(body);
    const iOS = IOS_UA.test(userAgent);
    return iOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

export async function shareFriendlyBet({ url, title, text }) {
    const shareText = text || title || 'Friendly bet';
    const fullText = url && !shareText.includes(url) ? `${shareText}\n${url}` : shareText;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            const payload = {
                title: title || 'Friendly bet',
                text: fullText,
            };
            if (url && !fullText.includes(url)) payload.url = url;
            await navigator.share(payload);
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'cancelled';
        }
    }

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    if (MOBILE_UA.test(userAgent)) {
        window.location.href = buildSmsHref(fullText, userAgent);
        return 'sms';
    }

    try {
        await navigator.clipboard.writeText(fullText);
    } catch (err) {
        return 'unavailable';
    }
    return 'copied';
}
