import React, { useEffect } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import { useLocation } from 'react-router-dom';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';


const ViewMoneyLine = (props) => {


    const location = useLocation()
    const { bet } = location.state

    useEffect(() => {
        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, "MoneyLineBets");
                const q = query(MoneyLineBetCollection, where("bet", "==", bet.bet));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    console.log(doc.data().bet);
                });
            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])
    return (
        <div key={bet.id}>umm this should be the answer: {bet.bet}</div>
    );
};

export default ViewMoneyLine;
