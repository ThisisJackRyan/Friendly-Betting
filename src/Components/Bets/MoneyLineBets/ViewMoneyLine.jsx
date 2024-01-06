import React, { useState, useEffect } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import { useLocation } from 'react-router-dom';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';


const ViewMoneyLine = () => {

    const [bets, setBets] = useState([])


    const location = useLocation()
    const { bet } = location.state

    
    useEffect(() => {
        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, "MoneyLineBets");
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
                     <h1 className={css.betLabel}>{bets.bet}</h1>

                    <div className='blob'>

                        <div className={css.ViewLabel}>
                            <button className="betButton">Bet</button>
                            <h2>{bets.contestant1} </h2>
                            {bets.contestant1Odds > 0 ? <p className='green'>(+{bets.contestant1Odds})</p> : <p className="red">({bets.contestant1Odds})</p>}
                        </div>
                        <hr />
                        <div className={css.ViewLabel}>
                            <button className="betButton">Bet</button>
                            <h2>{bets.contestant2} </h2>
                            {bets.contestant2Odds > 0 ? <p className='green'>(+{bets.contestant2Odds})</p> : <p className='red'>({bets.contestant2Odds})</p>}
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

export default ViewMoneyLine;
