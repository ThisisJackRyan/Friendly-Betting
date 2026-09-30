import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../../../Config/firebase-config';
import { addDoc, doc, getDoc, updateDoc, collection } from 'firebase/firestore';
import { getSignedInUserInfo } from '../../../Config/base';
import { betShareText, shareFriendlyBet } from '../../Components/ShareBet';

const fieldClass =
    'border-blue-gray w-full rounded-md bg-white p-3 text-base outline-none focus:border-black';

const CreateMoneyLine = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isNew = location.state === null;

    const [question, setQuestion] = useState('');
    const [optionA, setOptionA] = useState('Yes');
    const [optionB, setOptionB] = useState('No');
    const [stake, setStake] = useState('');
    const [closes, setCloses] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [shareUrl, setShareUrl] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (location.state == null) return;
        try {
            const bets = location.state.bets || {};
            setQuestion(bets.bet || '');
            setOptionA(bets.contestant1 || 'Yes');
            setOptionB(bets.contestant2 || 'No');
            setStake(bets.stake || '');
            setCloses(bets.closes || '');
        } catch (e) {
            console.error(e);
        }
    }, [location.state]);

    const betPath = (id) => `/Friendly-Betting/Bet/MoneyLineBets/${id}/`;

    const shareCreatedBet = async (url) => {
        const result = await shareFriendlyBet({
            url,
            title: question.trim(),
            text: betShareText({
                question: question.trim(),
                optionA: optionA.trim() || 'Yes',
                optionB: optionB.trim() || 'No',
                stake: stake.trim(),
                url,
            }),
        });
        if (result === 'copied') setNotice('Link copied. Paste it into a text.');
        else if (result === 'unavailable') setNotice('Share is not available here. Copy the link below.');
        else setNotice('');
        return result;
    };

    const updateBet = async () => {
        const betsDocRef = doc(db, 'bets', location.state.betUrl.id);
        const betsDocSnap = await getDoc(betsDocRef);
        const payload = {
            bet: question.trim(),
            contestant1: optionA.trim() || 'Yes',
            contestant2: optionB.trim() || 'No',
            stake: stake.trim(),
            closes,
            favorite: '',
        };
        await updateDoc(doc(db, 'MoneyLineBets', betsDocSnap.data().betID), payload);
        navigate(betPath(location.state.betUrl.id));
    };

    const createBet = async () => {
        const userInfo = getSignedInUserInfo();
        const payload = {
            bet: question.trim(),
            contestant1: optionA.trim() || 'Yes',
            contestant2: optionB.trim() || 'No',
            stake: stake.trim(),
            closes,
            favorite: '',
        };
        const betRef = await addDoc(collection(db, 'MoneyLineBets'), payload);
        const betLocation = await addDoc(collection(db, 'bets'), {
            betID: betRef.id,
            type: 'Money Line',
            bet: payload.bet,
            createdByID: userInfo?.uid ?? null,
            createdByEmail: userInfo?.email ?? null,
            stake: payload.stake,
            closes,
        });
        return betLocation.id;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!question.trim()) {
            setError('Add a question first.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            if (!isNew) {
                await updateBet();
                return;
            }
            if (shareUrl) {
                await shareCreatedBet(shareUrl);
                return;
            }
            const id = await createBet();
            const url = `${window.location.origin}${betPath(id)}`;
            setShareUrl(url);
            const result = await shareCreatedBet(url);
            if (result === 'shared' || result === 'cancelled') {
                navigate(betPath(id));
            }
        } catch (err) {
            console.error(err);
            setError('Could not save that bet. Try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="pb-28 pt-2">
            <h1 className="mb-6 text-2xl font-medium">{isNew ? 'New bet' : 'Edit bet'}</h1>

            <label className="mb-5 block">
                <span className="mb-1 block font-medium">
                    Question <span aria-hidden="true">*</span>
                </span>
                <textarea
                    required
                    rows="3"
                    className={fieldClass}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Who shows up last?"
                />
            </label>

            <label className="mb-5 block">
                <span className="mb-1 block font-medium">Option A</span>
                <input
                    type="text"
                    className={fieldClass}
                    value={optionA}
                    onChange={(e) => setOptionA(e.target.value)}
                    placeholder="Yes"
                />
            </label>

            <label className="mb-5 block">
                <span className="mb-1 block font-medium">Option B</span>
                <input
                    type="text"
                    className={fieldClass}
                    value={optionB}
                    onChange={(e) => setOptionB(e.target.value)}
                    placeholder="No"
                />
            </label>

            <label className="mb-5 block">
                <span className="mb-1 block font-medium">
                    Stake <span className="font-normal text-gray-500">(optional)</span>
                </span>
                <input
                    type="text"
                    className={fieldClass}
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    placeholder="Loser buys coffee"
                />
            </label>

            <label className="mb-5 block">
                <span className="mb-1 block font-medium">Closes</span>
                <input
                    type="datetime-local"
                    className={fieldClass}
                    value={closes}
                    onChange={(e) => setCloses(e.target.value)}
                />
            </label>

            {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
            {notice ? <p className="mb-2 text-sm text-gray-600">{notice}</p> : null}
            {shareUrl ? (
                <p className="mb-3 break-all rounded-md bg-spring-green-light p-3 text-sm">
                    {shareUrl}
                </p>
            ) : null}

            <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 border-t border-[#ddece0] bg-white px-4 py-3">
                <button
                    type="submit"
                    disabled={saving}
                    className="h-14 w-full rounded-md text-lg font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: 'var(--dark-spring-green)' }}
                >
                    {saving ? 'Sending…' : isNew ? 'Text friends' : 'Save'}
                </button>
            </div>
        </form>
    );
};

export default CreateMoneyLine;
