import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Players from '../Players/Players';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';

const ViewOverUnder = () => {

    const [bets, setBets] = useState([])

    const location = useLocation()
    const { bet } = location.state


    useEffect(() => {

        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, "OverUnderBets");
                const q = query(MoneyLineBetCollection, where("bet", "==", bet.bet));
                const querySnapshot = await getDocs(q);
               setBets(querySnapshot.docs[0].data());

            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])
    return (
        <div className='flex pad'>
            <div className='x2'>
                <div>
                   <h1>{bets.bet}</h1>
                   <h4>{bets.line}</h4> 
                </div>
            </div>
            <div className="x1">
                <Players />
            </div>
            
        </div>
    );
};

export default ViewOverUnder;
