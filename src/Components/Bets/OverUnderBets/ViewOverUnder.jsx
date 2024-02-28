import React from 'react';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Buttons from '../../Components/Buttons';
import Players from '../Players/Players';
import DeleteButton from '../../Components/DeleteButton';
import ShareButton from '../../Components/ShareButton';
import css from './OverUnder.module.css';
import {db} from '../../../Config/firebase-config';
import { doc, getDoc , updateDoc} from 'firebase/firestore';

const ViewOverUnder = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')

    const collectionName = "OverUnderBets"

    const bet = useParams();

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

    const fetchBet = async () => {
        try{
            const betsDocRef = doc(db, "bets", bet.id);
            const betsDocSnap = await getDoc(betsDocRef);
            setBetId(betsDocSnap.data().betID);
            
            const docRef = doc(db, collectionName, betsDocSnap.data().betID);
            const docSnap = await getDoc(docRef);
            setBets(docSnap.data());

        } catch (e) {
            console.error(e);
        }
    }

    useEffect(() => {
        fetchBet();
    }, [])
    return (
        <div className='flex p-12'>
            <div className='x2'>
                <div>
                    <div className="flex justify-around">
                        <h1 className={`pb-4 bl-4 ${css.betLabel}`} >{bets.bet}</h1>
                        <DeleteButton  collection={collectionName} docId={betId} />
                        <ShareButton />
                    </div>
                   <div className={`blob row p-16`}>
                        <div className="flex flex-col justify-center items-center">
                            <Buttons click={addUnder} text="Under" a="greenButton" size="big"></Buttons>
                            <p>{bets.under || 0} others have taken the under</p>
                        </div>
                        <div className={css.line}>
                            <div className={css.lineLabel}><span>Line</span></div>
                            <div className={css.actualLine}>{bets.line}</div> 
                            <div className="flex justify-center items-center break-words text-center">3 people have not voted</div>
                        </div>
                        <div className="flex flex-col justify-center items-center">
                            <Buttons click={addOver} text="Over" a="greenButton" size="big"></Buttons>
                            <p className="text-center">{bets.over } others have taken the over</p>
                        </div>
                   </div>
                </div>
            </div>
            <div className="x1">
                <Players />
            </div>
            
        </div>
    );
};

export default ViewOverUnder;
