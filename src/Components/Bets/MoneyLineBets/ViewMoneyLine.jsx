import React, { useState, useEffect } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import Buttons from '../../Components/Buttons';
import { useLocation } from 'react-router-dom';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';
import DeleteButton from '../../Components/DeleteButton';


const ViewMoneyLine = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')

    const collectionName = "MoneyLineBets"

    const location = useLocation()
    const { bet } = location.state
    
    useEffect(() => {
        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, collectionName);
                const q = query(MoneyLineBetCollection, where("bet", "==", bet.bet));
                const querySnapshot = await getDocs(q);
               setBets(querySnapshot.docs[0].data());
               setBetId(querySnapshot.docs[0].id);
        

            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])


    return (
        <div className='flex p-12'>
            <div className='x2'>
               <div>
                    <div className="flex justify-around">
                        <h1 className={`pb-4 bl-4 ${css.betLabel}`}>{bets.bet}</h1>
                        <DeleteButton collection={collectionName} docId={betId}/>  
                    </div>
                    
                    <div className='blob'>
                        <div className="flex justify-center items-center gap-8 my-4 mx-8 ">
                            <button className="betButton">Bet</button>
                            <Buttons text="Bet" class="greenButton" size="big"></Buttons>
                            <h2>{bets.contestant1} </h2>
                            {bets.contestant1Odds > 0 ? <p className='green'>(+{bets.contestant1Odds})</p> : <p className="red">({bets.contestant1Odds})</p>}
                        </div>
                        <hr />
                        <div className="flex justify-center items-center gap-8 my-4 mx-8">
                            <button className="betButton">Bet</button>
                            <h2>{bets.contestant2} </h2>
                            {bets.contestant2Odds > 0 ? <p className='green'>(+{bets.contestant2Odds})</p> : <p className='red'>({bets.contestant2Odds})</p>}
                        </div>
                    </div>
                    
               </div>



            </div>
            <div className="flex-1">
                <Players />
            </div>
    </div>
    );
};

export default ViewMoneyLine;
