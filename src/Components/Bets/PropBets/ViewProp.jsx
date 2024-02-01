import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Players from '../Players/Players';
import DeleteButton from '../../Components/DeleteButton';
import css from './Prop.module.css';
import {db} from '../../../Config/firebase-config';
import { collection, getDocs, where , query } from 'firebase/firestore';
const ViewProp = () => {

    const [bets, setBets] = useState([])
    const [length, setLength] = useState(0)

    const location = useLocation()
    const { bet } = location.state


    useEffect(() => {

        const fetchBet = async () => {
            try{
                const MoneyLineBetCollection = collection(db, "PropBets");
                const q = query(MoneyLineBetCollection, where("bet", "==", bet.bet));
                const querySnapshot = await getDocs(q);
                setBets(querySnapshot.docs[0].data());
                setLength(querySnapshot.docs[0].data().options.length)
                

            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])


    return (
        <div>
            <div className='flex p-12'>
            <div className='x2'>
                <div>
                    <div className="flex justify-around">
                        <h1 className={css.betLabel} >{bets.bet}</h1>
                        <DeleteButton />  
                    </div>
                   
                   {length > 0 ? (
                        <div>
                            <h4><span>Betting</span></h4> 
                            <div className="pl-8">
                                {bets.options.map((option, index) => (
                                    <div key={index}>
                                        <p>{option}</p>
                                    </div>
                                )
                                )}
                            </div>
                        </div>
                    ): (null)}
                </div>
            </div>
            <div className="x1">
                <Players />
            </div>
            
        </div>
        </div>
    );
};

export default ViewProp;
