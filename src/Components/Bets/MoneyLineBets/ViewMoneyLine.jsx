import React, { useState, useEffect } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import { useLocation } from 'react-router-dom';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';


const ViewMoneyLine = (props) => {

    const [bets, setBets] = useState([])
    const location = useLocation()
    const { bet } = location.state

    
    useEffect(() => {
        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, "MoneyLineBets");
                const q = query(MoneyLineBetCollection, where("bet", "==", bet.bet));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    //console.log(doc.data().bet);
                });
               setBets(querySnapshot.docs[0].data());

            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])
    return (
        <div className='flex'>
            <div className='x2'>
                <form className={css.MoneyLine}>
                <div className={css.betContainer}>
                    Bet:
                    <div className={css.bet}>
                        <h3>{bets.bet}</h3>
                    </div>
                </div>
                <div className='flex'>
                    <div className={css.contestant}>
                        <div><span className={css.label}>Contestant 1</span></div>
                        <h4><span>{bets.contestant1}</span></h4>
                        <div className={css.odds}>
                            <span>(+ or - odds)</span>
                            <p><span>{bets.contestant1Odds}</span></p>
                        </div>
                    </div>
                    <div className={css.contestant}>
                        <div><span className={css.label}>Contestant 2</span></div>
                        <h4><span>{bets.contestant2}</span></h4>
                        <div className={css.odds}>
                            <span>(+ or - odds)</span>
                            <p><span>{bets.contestant2Odds}</span></p>
                        </div>
                    </div>
                </div>

                <button type="submit">Create Bet</button>
                </form>
            </div>
            <div className="x1">
                <Players />
            </div>
    </div>
    );
};

export default ViewMoneyLine;
