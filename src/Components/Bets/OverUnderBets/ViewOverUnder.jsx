import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Players from '../Players/Players';
import css from './OverUnder.module.css';
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
        <div className='flex p-12'>
            <div className='x2'>
                <div >
                   <h1 className={css.betLabel} >{bets.bet}</h1>
                   <div className={`blob row p-16`}>
                        <div className={css.section}>
                            <button className={`betButton ${css.button}`}>Under</button>
                            <p>8 others have taken the under</p>
                        </div>
                        <div className={css.line}>
                            <div className={css.lineLabel}><span>Line</span></div>
                            <div className={css.actualLine}>{bets.line}</div> 
                            <div className={css.remain}>3 people have not voted</div>
                        </div>
                        <div className={css.section}>
                            <button className='betButton'>Over</button>
                            <p>12 others have taken the over</p>
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
