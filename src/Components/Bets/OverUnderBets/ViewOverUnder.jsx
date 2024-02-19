import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Buttons from '../../Components/Buttons';
import Players from '../Players/Players';
import DeleteButton from '../../Components/DeleteButton';
import css from './OverUnder.module.css';
import {db} from '../../../Config/firebase-config';
import { doc, getDoc , updateDoc} from 'firebase/firestore';

const ViewOverUnder = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')

    const collectionName = "OverUnderBets"

    const location = useLocation()
    const { bet } = location.state

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
        const over = docSnap.data().over
        console.log(over);
        await updateDoc(docRef, {
            over: over + 1
        })
        fetchBet();
        
       
    }

    const fetchBet = async () => {
        try{
            const docRef = doc(db, collectionName, bet.betID);
            const docSnap = await getDoc(docRef);
            setBets(docSnap.data());
            setBetId(docSnap.id);

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
                        <h1 className={css.betLabel} >{bets.bet}</h1>
                        <DeleteButton  collection={collectionName} docId={betId} />
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
