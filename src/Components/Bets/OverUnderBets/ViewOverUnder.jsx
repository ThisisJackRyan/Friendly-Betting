import React from 'react';
import Buttons from '../../Components/Buttons';
import css from './OverUnder.module.css';
import {db} from '../../../Config/firebase-config';
import { doc, getDoc , updateDoc} from 'firebase/firestore';

const ViewOverUnder = ({bets, collectionName, betId, fetchBet}) => {

    const addUnder = async () => {
        const docRef = doc(db, collectionName, betId);
        const docSnap = await getDoc(docRef);
        const under = docSnap.data().under
        await updateDoc(docRef, {
            under: under + 1
        })
        fetchBet();
        
    
    }

    const addOver = async () => {
        const docRef = doc(db, collectionName, betId);
        const docSnap = await getDoc(docRef);
        const over = docSnap.data().over;
        await updateDoc(docRef, {
            over: over + 1
        })
        fetchBet();
        
       
    }

    return (
        <div className='flex justify-center items-center'>
            <div className={`blob flex-row p-16`}>
                <div className="flex flex-col justify-center items-center">
                    <Buttons click={addUnder} text="Under" a="greenButton" size="big"></Buttons>
                    <div className='max-w-40 text-center mt-4'>{bets.under || 0} others have taken the under</div>
                </div>
                <div className={css.line}>
                    <div className={css.lineLabel}><span>Line</span></div>
                    <div className={css.actualLine}>{bets.line}</div> 
                    <div className="flex justify-center items-start break-words max-w-40 text-center">3 people have not voted</div>
                </div>
                <div className="flex flex-col justify-center items-center">
                    <Buttons click={addOver} text="Over" a="greenButton" size="big"></Buttons>
                    <div className="max-w-40 text-center mt-4">{bets.over } others have taken the over</div>
                </div>
            </div>
        </div>
    );
};

export default ViewOverUnder;
