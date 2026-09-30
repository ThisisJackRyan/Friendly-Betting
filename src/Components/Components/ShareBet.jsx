const IOS_UA = /iPad|iPhone|iPod/i;
const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

export function betShareText({ question, optionA, optionB, stake }) {
    const lines = [question, `${optionA} or ${optionB}`];
    if (stake) lines.push(`Stake: ${stake}`);
    return lines.filter(Boolean).join('\n');
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
            await navigator.share({
                title: title || 'Friendly bet',
                text: shareText,
                url,
            });
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
