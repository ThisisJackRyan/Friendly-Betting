import React from 'react';
import { useState, useEffect } from 'react';
import BetNav from './BetNav';
import {db} from '../../Config/firebase-config';
import { collection, getDocs } from 'firebase/firestore';
import DisplayBet from './DisplayBet';
import Players from './Players/Players';
import css from './Bets.module.css';


const DisplayAllBets = () => {

    const [json, setJson] = useState("")
    const [display, setDisplay] = useState(false)
    const [bets, setBets] = useState([])


    useEffect(() => {
      const getBets = async () => {
        try{
          const data = await getDocs(collection(db, "bets"));
          const filteredData = data.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
          }));
          setBets(filteredData);
        } catch (e) {
          console.error(e);
        }
      }
      
      getBets();
    }, [])

    const swapDisplay = () => {
        setDisplay((current) => !current)
    }
  return (
    <div className='flex p-12'>
      <div className='x2'>
        {bets.length < 1 ? (
          <div>
            <h3>You are not in any bets yet</h3>
            <button className={css.createButton} onClick={swapDisplay}>Create One!</button>
            {display ? <BetNav swap={swapDisplay}/> : null}

          </div>
        ) : (
          <div>
            {bets.map((bet, id) => (
              <DisplayBet key={id} bet={bet} />
            ))}
            <button className={css.createButton} onClick={swapDisplay}>Create One!</button>
            {display ? <BetNav swap={swapDisplay}/> : null}
          </div>
        ) }
      </div>
      <div className='x1'>
        <Players />
      </div>
    </div>
  );
}

export default DisplayAllBets;
