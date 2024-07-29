import React from 'react';
import {useNavigate, useParams } from 'react-router-dom';
import css from './Components.module.css';
import {db} from '../../Config/firebase-config';
import { doc, deleteDoc } from "firebase/firestore";


const DeleteButton = ({collection, docId}) => {

    const navigate = useNavigate();


    const bet = useParams();

    const handleDelete = () => {
        const deleteDocument  = async () => {
            try {
                await deleteDoc(doc(db, collection, docId));
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
