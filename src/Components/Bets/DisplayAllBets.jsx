import React from 'react';
import { useState, useEffect } from 'react';
import BetNav from './BetNav';
import {db} from '../../Config/firebase-config';
import { collection, getDocs } from 'firebase/firestore';

const DisplayAllBets = () => {

    const [json, setJson] = useState("")
    const [display, setDisplay] = useState(false)
    const [bets, setBets] = useState([])

    const betsCollectionRef = collection(db, "bets");

    useEffect(() => {
      const getBets = async () => {
        //read
        //set
        try{
          const data = await getDocs(betsCollectionRef);
          const filteredData = data.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
          }));
          console.log(filteredData);
          setBets(filteredData);
        } catch (e) {
          console.error(e);
        }
      }
      
      getBets();
    }, [])


    const addJson = (newJson) => {

    }
    const swapDisplay = () => {
        setDisplay((current) => !current)
    }
  return (
    <div>
      {json === " " ? (
        <div>
          <h3>You are not in any bets yet</h3>
          <button onClick={swapDisplay}>Create One!</button>
          {display ? <BetNav swap={swapDisplay}/> : null}

        </div>
      ) : (
        <div>
          {bets.map((bet) => (
            <div key={bet.id}>
              <h3>{bet.type}</h3>
              <p>{bet.bet}</p>
            </div>
          ))}
          <button onClick={swapDisplay}>Create One!</button>
          {display ? <BetNav swap={swapDisplay}/> : null}
        </div>
      ) }
    </div>
  );
}

export default DisplayAllBets;
