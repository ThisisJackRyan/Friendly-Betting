import React from 'react';
import {useLocation, useNavigate } from 'react-router-dom';
import css from './Components.module.css';
import {db} from '../../Config/firebase-config';
import { doc, deleteDoc } from "firebase/firestore";


const DeleteButton = (props) => {

    const navigate = useNavigate();

    const location = useLocation()
    const { bet } = location.state
    console.log(bet);

    const handleDelete = () => {
        const deleteDocument  = async () => {
            try {
                await deleteDoc(doc(db, props.collection, props.docId));
                await deleteDoc(doc(db, "bets" , bet.id));
                navigate("/Friendly-Betting/Bet"); 
            }
            catch (e) {
                console.error(e);
            }
        }
        deleteDocument();
    };
    
    return (
        <div className='flex justify-center items-center'>
            <button className={css.DeleteButton} onClick={handleDelete}>
            Delete
            </button>
        </div>
    );
};


export default DeleteButton;
