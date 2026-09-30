import React, { useState } from 'react';
import { shareFriendlyBet } from './ShareBet';

const ShareButton = ({ url, title, text }) => {
    const [notice, setNotice] = useState('');

    const handleShare = async () => {
        const result = await shareFriendlyBet({
            url: url || window.location.href,
            title: title || 'Friendly bet',
            text,
        });
        if (result === 'copied') setNotice('Link copied. Paste it into a text.');
        else if (result === 'unavailable') setNotice('Copy the link from the address bar to text it.');
        else setNotice('');
    };

    return (
        <div>
            <button
                type="button"
                onClick={handleShare}
                className="h-14 w-full rounded-md text-lg font-medium text-white"
                style={{ backgroundColor: 'var(--dark-spring-green)' }}
            >
                Text friends
            </button>
            {notice ? <p className="mt-2 text-sm text-gray-600">{notice}</p> : null}
        </div>
    );
};

export default ShareButton;
