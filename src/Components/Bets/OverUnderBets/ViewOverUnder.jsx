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
        <div>
            <div className="blob">
                <div className="flex flex-col gap-4 text-center text-2xl">
                    <div>
                        <Buttons click={addOver} text="Over" a="betButton" size="big"></Buttons>
                    </div>
                    <div>
                        Line: {bets.line}
                    </div>
                    <div>
                        <Buttons click={addUnder} text="Under" a="betButton" size="big"></Buttons>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ViewOverUnder;
